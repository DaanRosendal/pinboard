import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const STATE_KEY = 'pinboard.paths';
const DND_MIME = 'application/vscode.tree.pinboard';

// Sync stat used only at startup/scope-change (loadFromStorage), not during tree rendering.
function pathExists(p: string): boolean {
  try { fs.statSync(p); return true; } catch { return false; }
}

export type Pin = { path: string; alias?: string };
type PresetEntry = string | { path: string; alias?: string };

export class PinnedItemRoot extends vscode.TreeItem {
  readonly kind = 'root' as const;

  constructor(
    public readonly itemPath: string,
    public readonly isDirectory: boolean,
    isCurrentWorkspace: boolean,
    position: 'single' | 'first' | 'middle' | 'last',
    label: string,
    hasAlias: boolean
  ) {
    super(
      label,
      isDirectory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    this.id = itemPath;
    this.tooltip = itemPath;
    this.resourceUri = vscode.Uri.file(itemPath);

    const aliasSuffix = hasAlias ? 'Aliased' : '';
    if (isDirectory) {
      const base = isCurrentWorkspace ? 'pinnedFolderActive' : 'pinnedFolder';
      this.contextValue = `${base}${capitalize(position)}${aliasSuffix}`;
    } else {
      this.contextValue = `pinnedFileRoot${capitalize(position)}${aliasSuffix}`;
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [vscode.Uri.file(itemPath)],
      };
    }
  }
}

export class FileSystemItem extends vscode.TreeItem {
  readonly kind = 'fsitem' as const;

  constructor(
    public readonly itemPath: string,
    public readonly isDirectory: boolean
  ) {
    super(
      path.basename(itemPath),
      isDirectory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    this.id = itemPath;
    this.resourceUri = vscode.Uri.file(itemPath);
    this.contextValue = isDirectory ? 'pinnedDirectory' : 'pinnedFile';
    if (!isDirectory) {
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [vscode.Uri.file(itemPath)],
      };
    }
  }
}

type AnyItem = PinnedItemRoot | FileSystemItem;

export class PinboardProvider
  implements
    vscode.TreeDataProvider<AnyItem>,
    vscode.TreeDragAndDropController<AnyItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    AnyItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  readonly dropMimeTypes = [DND_MIME];
  readonly dragMimeTypes = [DND_MIME];

  private pins: Pin[];
  private _fsWatchers: vscode.FileSystemWatcher[] = [];
  private _refreshTimer: NodeJS.Timeout | undefined;
  private _dirPins = new Set<string>();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.pins = this.loadFromStorage();
    this.rebuildWatchers();
  }

  // ── Scope helpers ──────────────────────────────────────────────────────────

  getScope(): 'global' | 'workspace' {
    return vscode.workspace
      .getConfiguration('pinboard')
      .get<'global' | 'workspace'>('scope', 'global');
  }

  private get storage(): vscode.Memento {
    return this.getScope() === 'workspace'
      ? this.context.workspaceState
      : this.context.globalState;
  }

  private loadFromStorage(): Pin[] {
    const pins = this.storage.get<Pin[]>(STATE_KEY, []);
    const valid = pins.filter(pin => pathExists(pin.path));
    if (valid.length !== pins.length) {
      void this.storage.update(STATE_KEY, valid);
    }
    return valid;
  }

  onScopeChanged(): void {
    this.pins = this.loadFromStorage();
    this.refresh();
  }

  // ── TreeDataProvider ───────────────────────────────────────────────────────

  getTreeItem(element: AnyItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: AnyItem): Promise<AnyItem[]> {
    if (!element) {
      const openPaths = new Set(
        (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath)
      );
      this._dirPins.clear();
      return Promise.all(
        this.pins.map(async (pin, index) => {
          let dir = false;
          try { dir = (await fs.promises.stat(pin.path)).isDirectory(); } catch { /* treated as file */ }
          if (dir) this._dirPins.add(pin.path);
          return new PinnedItemRoot(
            pin.path, dir, openPaths.has(pin.path),
            this.getPinnedItemPosition(index),
            this.getLabelForPath(pin),
            !!pin.alias
          );
        })
      );
    }

    // File roots and nested files have no children
    if (element.kind === 'root' && !element.isDirectory) return [];

    const dirPath = element.itemPath;

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter(e => !e.name.startsWith('.'))
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        })
        .map(e => new FileSystemItem(path.join(dirPath, e.name), e.isDirectory()));
    } catch {
      return [];
    }
  }

  getParent(element: AnyItem): vscode.ProviderResult<AnyItem> {
    if (element.kind === 'root') return undefined;
    const parentPath = path.dirname(element.itemPath);
    const pin = this.pins.find(p => p.path === parentPath);
    if (pin) {
      return new PinnedItemRoot(
        pin.path, true, false,
        this.getPinnedItemPosition(this.pins.indexOf(pin)),
        this.getLabelForPath(pin),
        !!pin.alias
      );
    }
    return new FileSystemItem(parentPath, true);
  }

  revealActiveFile(treeView: vscode.TreeView<AnyItem>, fsPath: string): void {
    if (!treeView.visible) return;

    // Exact match for pinned root files (not directories)
    const exactPin = this.pins.find(p => p.path === fsPath);
    if (exactPin && !this._dirPins.has(fsPath)) {
      const index = this.pins.indexOf(exactPin);
      const item = new PinnedItemRoot(
        exactPin.path, false, false,
        this.getPinnedItemPosition(index),
        this.getLabelForPath(exactPin),
        !!exactPin.alias
      );
      treeView.reveal(item, { select: true, focus: false, expand: false });
      return;
    }

    // Find best (longest) matching directory pin
    let bestPin: Pin | undefined;
    for (const pin of this.pins) {
      if (!this._dirPins.has(pin.path)) continue;
      if (!fsPath.startsWith(pin.path + path.sep)) continue;
      if (!bestPin || pin.path.length > bestPin.path.length) {
        bestPin = pin;
      }
    }
    if (!bestPin) return;

    const item = new FileSystemItem(fsPath, false);
    treeView.reveal(item, { select: true, focus: false, expand: false });
  }

  // ── DnD ───────────────────────────────────────────────────────────────────

  handleDrag(source: readonly AnyItem[], dataTransfer: vscode.DataTransfer): void {
    const roots = source.filter((i): i is PinnedItemRoot => i.kind === 'root');
    if (roots.length === 0) return;
    dataTransfer.set(
      DND_MIME,
      new vscode.DataTransferItem(roots.map(r => r.itemPath))
    );
  }

  async handleDrop(target: AnyItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const item = dataTransfer.get(DND_MIME);
    if (!item) return;
    const dragged: string[] = item.value;
    const remaining = this.pins.filter(p => !dragged.includes(p.path));
    const draggedPins = dragged.map(d => this.pins.find(p => p.path === d)!).filter(Boolean);
    const dropPath = target?.kind === 'root' ? target.itemPath : undefined;
    if (dropPath) {
      const insertAt = remaining.findIndex(p => p.path === dropPath);
      if (insertAt >= 0) {
        remaining.splice(insertAt, 0, ...draggedPins);
      } else {
        remaining.push(...draggedPins);
      }
    } else {
      remaining.push(...draggedPins);
    }
    this.pins = remaining;
    await this.persist();
    this.refresh();
  }

  // ── Root-level commands ────────────────────────────────────────────────────

  async addItem(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: true,
      canSelectMany: true,
      openLabel: 'Pin',
    });
    if (!uris || uris.length === 0) return;
    let changed = false;
    for (const uri of uris) {
      if (!this.pins.some(p => p.path === uri.fsPath)) {
        this.pins.push({ path: uri.fsPath });
        changed = true;
      }
    }
    if (changed) { await this.persist(); this.refresh(); }
  }

  async removeItem(item: PinnedItemRoot): Promise<void> {
    this.pins = this.pins.filter(p => p.path !== item.itemPath);
    await this.persist();
    this.refresh();
  }

  async renamePinnedItem(item: PinnedItemRoot): Promise<void> {
    const oldName = path.basename(item.itemPath);
    const newName = await vscode.window.showInputBox({
      prompt: `New name`,
      value: oldName,
      valueSelection: [0, oldName.lastIndexOf('.') > 0 ? oldName.lastIndexOf('.') : oldName.length],
      validateInput: v => v.trim() ? undefined : 'Name cannot be empty',
    });
    if (!newName) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    const newItemPath = path.join(path.dirname(item.itemPath), trimmed);
    try {
      await vscode.workspace.fs.rename(
        vscode.Uri.file(item.itemPath),
        vscode.Uri.file(newItemPath)
      );
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to rename: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    this.pins = this.pins.map(p =>
      p.path === item.itemPath ? { ...p, path: newItemPath } : p
    );
    await this.persist();
    this.refresh();
  }

  async deletePinnedItem(item: PinnedItemRoot): Promise<void> {
    const name = path.basename(item.itemPath);
    const label = item.isDirectory ? `Delete "${name}" and all its contents?` : `Delete "${name}"?`;
    const answer = await vscode.window.showWarningMessage(label, { modal: true }, 'Move to Trash');
    if (answer !== 'Move to Trash') return;
    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(item.itemPath), {
        recursive: true,
        useTrash: true,
      });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    this.pins = this.pins.filter(p => p.path !== item.itemPath);
    await this.persist();
    this.refresh();
  }

  openInNewWindow(item: PinnedItemRoot): void {
    vscode.commands.executeCommand(
      'vscode.openFolder',
      vscode.Uri.file(item.itemPath),
      { forceNewWindow: true }
    );
  }

  async moveItemUp(item: PinnedItemRoot): Promise<void> {
    const index = this.pins.findIndex(p => p.path === item.itemPath);
    if (index <= 0) return;
    const reordered = [...this.pins];
    [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
    this.pins = reordered;
    await this.persist();
    this.refresh();
  }

  async moveItemDown(item: PinnedItemRoot): Promise<void> {
    const index = this.pins.findIndex(p => p.path === item.itemPath);
    if (index < 0 || index >= this.pins.length - 1) return;
    const reordered = [...this.pins];
    [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
    this.pins = reordered;
    await this.persist();
    this.refresh();
  }

  async pinFromExplorer(uri?: vscode.Uri): Promise<void> {
    if (!uri) {
      await this.addItem();
      return;
    }
    if (!this.pins.some(p => p.path === uri.fsPath)) {
      this.pins.push({ path: uri.fsPath });
      await this.persist();
      this.refresh();
    }
  }

  async setAlias(item: PinnedItemRoot): Promise<void> {
    const pin = this.pins.find(p => p.path === item.itemPath);
    if (!pin) return;
    const currentAlias = pin.alias ?? '';
    const result = await vscode.window.showInputBox({
      prompt: 'Set display alias (leave empty to remove)',
      value: currentAlias,
      placeHolder: path.basename(item.itemPath),
    });
    if (result === undefined) return;
    const trimmed = result.trim();
    if (trimmed === currentAlias) return;
    if (trimmed) {
      pin.alias = trimmed;
    } else {
      delete pin.alias;
    }
    await this.persist();
    this.refresh();
  }

  async removeAlias(item: PinnedItemRoot): Promise<void> {
    const pin = this.pins.find(p => p.path === item.itemPath);
    if (!pin || !pin.alias) return;
    delete pin.alias;
    await this.persist();
    this.refresh();
  }

  // ── File / directory commands ──────────────────────────────────────────────

  async openToSide(item: FileSystemItem | PinnedItemRoot): Promise<void> {
    await vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.file(item.itemPath),
      { viewColumn: vscode.ViewColumn.Beside }
    );
  }

  revealInOS(item: FileSystemItem | PinnedItemRoot): void {
    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(item.itemPath));
  }

  async copyPath(item: FileSystemItem | PinnedItemRoot): Promise<void> {
    await vscode.env.clipboard.writeText(item.itemPath);
    vscode.window.setStatusBarMessage(`Copied: ${item.itemPath}`, 2000);
  }

  async rename(item: FileSystemItem): Promise<void> {
    const oldName = path.basename(item.itemPath);
    const newName = await vscode.window.showInputBox({
      prompt: 'New name',
      value: oldName,
      valueSelection: [0, oldName.lastIndexOf('.') > 0 ? oldName.lastIndexOf('.') : oldName.length],
      validateInput: v => v.trim() ? undefined : 'Name cannot be empty',
    });
    if (!newName) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    const newPath = path.join(path.dirname(item.itemPath), trimmed);
    try {
      await vscode.workspace.fs.rename(
        vscode.Uri.file(item.itemPath),
        vscode.Uri.file(newPath)
      );
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to rename: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    this.refresh();
  }

  async deleteItem(item: FileSystemItem): Promise<void> {
    const name = path.basename(item.itemPath);
    const answer = await vscode.window.showWarningMessage(
      `Delete "${name}"?`,
      { modal: true },
      'Move to Trash'
    );
    if (answer !== 'Move to Trash') return;
    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(item.itemPath), {
        recursive: true,
        useTrash: true,
      });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    this.refresh();
  }

  async newFile(item: FileSystemItem | PinnedItemRoot): Promise<void> {
    const dirPath = item.itemPath;
    const name = await vscode.window.showInputBox({ prompt: 'New file name' });
    if (!name?.trim()) return;
    const newPath = path.join(dirPath, name.trim());
    try {
      await vscode.workspace.fs.writeFile(vscode.Uri.file(newPath), new Uint8Array());
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to create file: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    this.refresh();
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(newPath));
  }

  async newFolder(item: FileSystemItem | PinnedItemRoot): Promise<void> {
    const dirPath = item.itemPath;
    const name = await vscode.window.showInputBox({ prompt: 'New folder name' });
    if (!name?.trim()) return;
    const newPath = path.join(dirPath, name.trim());
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(newPath));
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to create folder: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    this.refresh();
  }

  openInTerminal(item: FileSystemItem | PinnedItemRoot): void {
    const dirPath = item.isDirectory ? item.itemPath : path.dirname(item.itemPath);
    const existing = vscode.window.terminals.find(t => t.creationOptions && 'cwd' in t.creationOptions && t.creationOptions.cwd === dirPath);
    const terminal = existing ?? vscode.window.createTerminal({ cwd: dirPath });
    terminal.show();
  }

  findInFolder(item: FileSystemItem | PinnedItemRoot): void {
    vscode.commands.executeCommand('workbench.action.findInFiles', {
      filesToInclude: item.itemPath,
      query: '',
    });
  }

  async copyRelativePath(item: FileSystemItem | PinnedItemRoot): Promise<void> {
    const uri = vscode.Uri.file(item.itemPath);
    const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
    const relative = wsFolder
      ? path.relative(wsFolder.uri.fsPath, item.itemPath)
      : path.basename(item.itemPath);
    await vscode.env.clipboard.writeText(relative);
    vscode.window.setStatusBarMessage(`Copied: ${relative}`, 2000);
  }

  // ── Preset commands ────────────────────────────────────────────────────────

  readPresets(): Array<{ name: string; paths: PresetEntry[] }> | null {
    const root = this.getWorkspaceRoot();
    if (!root) return null;
    const filePath = path.join(root, '.pinboard.json');
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed !== 'object' || parsed === null ||
        !Array.isArray((parsed as { presets?: unknown }).presets)
      ) return null;
      const presets = (parsed as { presets: unknown[] }).presets;
      const valid = presets.filter(
        (p): p is { name: string; paths: PresetEntry[] } =>
          typeof p === 'object' && p !== null &&
          typeof (p as { name?: unknown }).name === 'string' &&
          Array.isArray((p as { paths?: unknown }).paths) &&
          ((p as { paths: unknown[] }).paths).every(x =>
            typeof x === 'string' ||
            (typeof x === 'object' && x !== null && typeof (x as { path?: unknown }).path === 'string')
          )
      );
      return valid.length > 0 ? valid : null;
    } catch {
      return null;
    }
  }

  async applyPreset(preset: { name: string; paths: PresetEntry[] }): Promise<void> {
    if (this.getScope() !== 'workspace') return;
    const root = this.getWorkspaceRoot();
    if (!root) return;
    this.pins = preset.paths
      .map(entry => typeof entry === 'string'
        ? { path: path.join(root, entry) }
        : { path: path.join(root, entry.path), ...(entry.alias ? { alias: entry.alias } : {}) }
      )
      .filter(pin => pathExists(pin.path));
    await this.context.workspaceState.update(STATE_KEY, this.pins);
    this.refresh();
  }

  async openWorkspaceConfig(): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      vscode.window.showInformationMessage('No workspace folder is open.');
      return;
    }
    const filePath = path.join(root, '.pinboard.json');
    if (!fs.existsSync(filePath)) {
      const answer = await vscode.window.showInformationMessage(
        'No .pinboard.json found in workspace root. Create one?',
        'Create'
      );
      if (answer !== 'Create') return;
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(filePath),
        Buffer.from(JSON.stringify({ presets: [] }, null, 2), 'utf8')
      );
    }
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
  }

  updatePresetsContext(): void {
    const presets = this.readPresets();
    vscode.commands.executeCommand(
      'setContext',
      'pinboard.hasPresets',
      presets !== null && presets.length > 0
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  isEmpty(): boolean {
    return this.pins.length === 0;
  }

  refresh(): void {
    this.rebuildWatchers();
    this._onDidChangeTreeData.fire(undefined);
  }

  dispose(): void {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    for (const w of this._fsWatchers) w.dispose();
    this._fsWatchers = [];
  }

  private rebuildWatchers(): void {
    for (const w of this._fsWatchers) w.dispose();
    this._fsWatchers = [];
    for (const pin of this.pins) {
      let isDir = false;
      try { isDir = fs.statSync(pin.path).isDirectory(); } catch { continue; }
      const pattern = isDir
        ? new vscode.RelativePattern(vscode.Uri.file(pin.path), '**/*')
        : new vscode.RelativePattern(vscode.Uri.file(path.dirname(pin.path)), path.basename(pin.path));
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidCreate(() => this.fireChangeDebounced());
      watcher.onDidDelete(() => this.fireChangeDebounced());
      this._fsWatchers.push(watcher);
    }
  }

  private fireChangeDebounced(): void {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => {
      this._onDidChangeTreeData.fire(undefined);
    }, 300);
  }

  private getWorkspaceRoot(): string | null {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }

  private async persist(): Promise<void> {
    await this.storage.update(STATE_KEY, this.pins);
  }

  private getPinnedItemPosition(index: number): 'single' | 'first' | 'middle' | 'last' {
    if (this.pins.length === 1) return 'single';
    if (index === 0) return 'first';
    if (index === this.pins.length - 1) return 'last';
    return 'middle';
  }

  private getLabelForPath(pin: Pin): string {
    if (pin.alias) return pin.alias;
    const style = vscode.workspace
      .getConfiguration('pinboard')
      .get<'name' | 'relativePath'>('labelStyle', 'name');
    if (style === 'relativePath') {
      const wsFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(pin.path));
      if (wsFolder) {
        const rel = path.relative(wsFolder.uri.fsPath, pin.path);
        return rel || path.basename(pin.path);
      }
    }
    return path.basename(pin.path);
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
