import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const STATE_KEY = 'pinboard.paths';
const DND_MIME = 'application/vscode.tree.pinboard';
const FS_DND_MIME = 'application/vscode.tree.pinboard.items';
const ALWAYS_HIDDEN = new Set(['.git', '.svn', '.hg', '.jj', '.DS_Store', 'Thumbs.db']);

// Sync stat used only at startup/scope-change (loadFromStorage), not during tree rendering.
function pathExists(p: string): boolean {
  try { fs.statSync(p); return true; } catch { return false; }
}

function realPathOrSelf(p: string): string {
  try { return fs.realpathSync(p); } catch { return p; }
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

  readonly dropMimeTypes = [DND_MIME, FS_DND_MIME];
  readonly dragMimeTypes = [DND_MIME, FS_DND_MIME];

  private pins: Pin[];
  private _fsWatchers: vscode.FileSystemWatcher[] = [];
  private _refreshTimer: NodeJS.Timeout | undefined;
  private _dirPins = new Set<string>();
  private _lastRevealedPath: string | undefined;
  private _staleId: string | undefined;
  private _staleTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.pins = this.loadFromStorage();
    this.rebuildWatchers();
    this.syncPinContextKeys();
  }

  // ── Scope helpers ──────────────────────────────────────────────────────────

  getScope(): 'global' | 'workspace' {
    return vscode.workspace
      .getConfiguration('pinboard')
      .get<'global' | 'workspace'>('scope', 'workspace');
  }

  private storageFor(scope: 'global' | 'workspace'): vscode.Memento {
    return scope === 'workspace' ? this.context.workspaceState : this.context.globalState;
  }

  private get storage(): vscode.Memento {
    return this.storageFor(this.getScope());
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
    if (this._staleId && element.itemPath === this._staleId) {
      element.id = element.itemPath + '\0';
    }
    return element;
  }

  async getChildren(element?: AnyItem): Promise<AnyItem[]> {
    if (!element) {
      const openPaths = new Set(
        (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath)
      );
      return Promise.all(
        this.viewPins().map(async (pin, index) => {
          let dir = false;
          try { dir = (await fs.promises.stat(pin.path)).isDirectory(); } catch { /* treated as file */ }
          return this.makeRoot(pin, dir, openPaths.has(pin.path), index);
        })
      );
    }

    // File roots and nested files have no children
    if (element.kind === 'root' && !element.isDirectory) return [];

    const dirPath = element.itemPath;

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter(e => !ALWAYS_HIDDEN.has(e.name))
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
      return this.makeRoot(pin, true, false, this.viewPins().indexOf(pin));
    }
    return new FileSystemItem(parentPath, true);
  }

  revealActiveFile(treeView: vscode.TreeView<AnyItem>, fsPath: string): void {
    if (!treeView.visible) return;

    // Exact match for pinned root files (not directories)
    const exactPin = this.pins.find(p => p.path === fsPath);
    if (exactPin && !this._dirPins.has(fsPath)) {
      const index = this.viewPins().indexOf(exactPin);
      const item = this.makeRoot(exactPin, false, false, index);
      this._lastRevealedPath = fsPath;
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

    if (bestPin) {
      this._lastRevealedPath = fsPath;
      const item = new FileSystemItem(fsPath, false);
      treeView.reveal(item, { select: true, focus: false, expand: false });
    } else if (this._lastRevealedPath) {
      this.clearStaleSelection();
    }
  }

  // ── DnD ───────────────────────────────────────────────────────────────────

  handleDrag(source: readonly AnyItem[], dataTransfer: vscode.DataTransfer): void {
    const items = source.filter((i): i is FileSystemItem => i.kind === 'fsitem');
    if (items.length > 0) {
      dataTransfer.set(FS_DND_MIME, new vscode.DataTransferItem(items.map(i => i.itemPath)));
    }
    if (this.isSorted()) return;
    const roots = source.filter((i): i is PinnedItemRoot => i.kind === 'root');
    if (roots.length === 0) return;
    dataTransfer.set(
      DND_MIME,
      new vscode.DataTransferItem(roots.map(r => r.itemPath))
    );
  }

  async handleDrop(target: AnyItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const fsPaths: unknown = dataTransfer.get(FS_DND_MIME)?.value;
    if (Array.isArray(fsPaths) && fsPaths.length > 0) {
      await (target ? this.dropItems(target, fsPaths as string[]) : this.dropOnEmptySpace(fsPaths as string[]));
      return;
    }
    if (this.isSorted()) return;
    const item = dataTransfer.get(DND_MIME);
    if (!item) return;
    if (target?.kind === 'fsitem') {
      vscode.window.showErrorMessage(
        'Pinned items can only be reordered. Drop onto another pinned item, or use "Move to…" to move it into a folder.'
      );
      return;
    }
    const dragged: string[] = item.value;
    const fromIndex = this.pins.findIndex(p => p.path === dragged[0]);
    const toIndex = target?.kind === 'root' ? this.pins.findIndex(p => p.path === target.itemPath) : -1;
    const placeAfter = fromIndex >= 0 && toIndex > fromIndex;
    if (target?.kind === 'root' && target.isDirectory) {
      const others = dragged.filter(d => d !== target.itemPath);
      if (others.length === 0) return;
      const action = await this.chooseDropAction(target, placeAfter);
      if (!action) return;
      if (action === 'move') {
        await this.dropItems(target, others, this.dropSetting() === 'ask');
        return;
      }
    }
    const remaining = this.pins.filter(p => !dragged.includes(p.path));
    const draggedPins = dragged.map(d => this.pins.find(p => p.path === d)!).filter(Boolean);
    const dropPath = target?.kind === 'root' ? target.itemPath : undefined;
    if (dropPath) {
      const insertAt = remaining.findIndex(p => p.path === dropPath);
      if (insertAt >= 0) {
        remaining.splice(insertAt + (placeAfter ? 1 : 0), 0, ...draggedPins);
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
    if (changed) await this.commit();
  }

  async removeItem(item: PinnedItemRoot): Promise<void> {
    this.pins = this.pins.filter(p => p.path !== item.itemPath);
    await this.commit();
  }

  async renamePinnedItem(item: PinnedItemRoot): Promise<void> {
    const newItemPath = await this.renameOnDisk(item.itemPath);
    if (!newItemPath) return;
    this.pins = this.pins.map(p =>
      p.path === item.itemPath ? { ...p, path: newItemPath } : p
    );
    await this.commit();
  }

  async deletePinnedItem(item: PinnedItemRoot): Promise<void> {
    const name = path.basename(item.itemPath);
    const label = item.isDirectory ? `Delete "${name}" and all its contents?` : `Delete "${name}"?`;
    if (!(await this.confirmTrash(item.itemPath, label))) return;
    this.pins = this.pins.filter(p => p.path !== item.itemPath);
    await this.commit();
  }

  openInNewWindow(item: PinnedItemRoot): void {
    vscode.commands.executeCommand(
      'vscode.openFolder',
      vscode.Uri.file(item.itemPath),
      { forceNewWindow: true }
    );
  }

  async moveItemUp(item: PinnedItemRoot): Promise<void> {
    if (this.isSorted()) return;
    const index = this.pins.findIndex(p => p.path === item.itemPath);
    if (index <= 0) return;
    const reordered = [...this.pins];
    [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
    this.pins = reordered;
    await this.persist();
    this.refresh();
  }

  async moveItemDown(item: PinnedItemRoot): Promise<void> {
    if (this.isSorted()) return;
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

  async pinToGlobal(uri?: vscode.Uri): Promise<void> {
    await this.pinToScope(uri, 'global');
  }

  async pinToWorkspace(uri?: vscode.Uri): Promise<void> {
    await this.pinToScope(uri, 'workspace');
  }

  async unpinFromGlobal(uri: vscode.Uri): Promise<void> {
    await this.unpinFromScope(uri, 'global');
  }

  async unpinFromWorkspace(uri: vscode.Uri): Promise<void> {
    await this.unpinFromScope(uri, 'workspace');
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
    if (await this.renameOnDisk(item.itemPath)) this.refresh();
  }

  async deleteItem(item: FileSystemItem): Promise<void> {
    const label = `Delete "${path.basename(item.itemPath)}"?`;
    if (await this.confirmTrash(item.itemPath, label)) this.refresh();
  }

  async newFile(item: FileSystemItem | PinnedItemRoot): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: 'New file name' });
    if (!name?.trim()) return;
    const newUri = vscode.Uri.file(path.join(item.itemPath, name.trim()));
    if (!(await this.tryFs('create file', () => vscode.workspace.fs.writeFile(newUri, new Uint8Array())))) return;
    this.refresh();
    await vscode.commands.executeCommand('vscode.open', newUri);
  }

  async newFolder(item: FileSystemItem | PinnedItemRoot): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: 'New folder name' });
    if (!name?.trim()) return;
    const newUri = vscode.Uri.file(path.join(item.itemPath, name.trim()));
    if (await this.tryFs('create folder', () => vscode.workspace.fs.createDirectory(newUri))) this.refresh();
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

  async moveTo(item: FileSystemItem | PinnedItemRoot): Promise<void> {
    await this.transferViaPicker(item, 'move');
  }

  async copyTo(item: FileSystemItem | PinnedItemRoot): Promise<void> {
    await this.transferViaPicker(item, 'copy');
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
    this.syncPinContextKeys();
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
    if (this._staleTimer) clearTimeout(this._staleTimer);
    for (const w of this._fsWatchers) w.dispose();
    this._fsWatchers = [];
  }

  private clearStaleSelection(): void {
    this._staleId = this._lastRevealedPath;
    this._lastRevealedPath = undefined;
    this._onDidChangeTreeData.fire(undefined);
    if (this._staleTimer) clearTimeout(this._staleTimer);
    // 500ms: long enough for VS Code to process the first refresh and call
    // getTreeItem (which sees the mangled id and drops selection), short enough
    // that the temporary id mismatch window is imperceptible to the user.
    this._staleTimer = setTimeout(() => {
      this._staleId = undefined;
      this._staleTimer = undefined;
      this._onDidChangeTreeData.fire(undefined);
    }, 500);
  }

  private rebuildWatchers(): void {
    for (const w of this._fsWatchers) w.dispose();
    this._fsWatchers = [];
    this._dirPins.clear();
    for (const pin of this.pins) {
      let isDir = false;
      try { isDir = fs.statSync(pin.path).isDirectory(); } catch { continue; }
      if (isDir) this._dirPins.add(pin.path);
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

  private makeRoot(pin: Pin, isDirectory: boolean, active: boolean, index: number): PinnedItemRoot {
    return new PinnedItemRoot(
      pin.path, isDirectory, active,
      this.getPinnedItemPosition(index),
      this.getLabelForPath(pin),
      !!pin.alias
    );
  }

  private async tryFs(what: string, op: () => Thenable<unknown>): Promise<boolean> {
    try {
      await op();
      return true;
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to ${what}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  private async promptRename(itemPath: string): Promise<string | undefined> {
    const oldName = path.basename(itemPath);
    const newName = await vscode.window.showInputBox({
      prompt: 'New name',
      value: oldName,
      valueSelection: [0, oldName.lastIndexOf('.') > 0 ? oldName.lastIndexOf('.') : oldName.length],
      validateInput: v => v.trim() ? undefined : 'Name cannot be empty',
    });
    const trimmed = newName?.trim();
    if (!trimmed || trimmed === oldName) return undefined;
    return path.join(path.dirname(itemPath), trimmed);
  }

  private async renameOnDisk(itemPath: string): Promise<string | undefined> {
    const newPath = await this.promptRename(itemPath);
    if (!newPath) return undefined;
    const renamed = await this.tryFs('rename', () =>
      vscode.workspace.fs.rename(vscode.Uri.file(itemPath), vscode.Uri.file(newPath))
    );
    return renamed ? newPath : undefined;
  }

  private async confirmTrash(itemPath: string, label: string): Promise<boolean> {
    const answer = await vscode.window.showWarningMessage(label, { modal: true }, 'Move to Trash');
    if (answer !== 'Move to Trash') return false;
    return this.tryFs('delete', () => this.trashItem(vscode.Uri.file(itemPath)));
  }

  private async persist(): Promise<void> {
    await this.storage.update(STATE_KEY, this.pins);
  }

  syncPinContextKeys(): void {
    const globalPaths = this.context.globalState.get<Pin[]>(STATE_KEY, []).map(p => p.path);
    const workspacePaths = this.context.workspaceState.get<Pin[]>(STATE_KEY, []).map(p => p.path);
    void vscode.commands.executeCommand('setContext', 'pinboard.globalPinPaths', globalPaths);
    void vscode.commands.executeCommand('setContext', 'pinboard.workspacePinPaths', workspacePaths);
  }

  private async unpinFromScope(uri: vscode.Uri, targetScope: 'global' | 'workspace'): Promise<void> {
    const targetStorage = this.storageFor(targetScope);
    const existing = targetStorage.get<Pin[]>(STATE_KEY, []);
    const filtered = existing.filter(p => p.path !== uri.fsPath);
    if (filtered.length === existing.length) return;
    await targetStorage.update(STATE_KEY, filtered);
    this.syncPinContextKeys();
    if (targetScope === this.getScope()) {
      this.pins = this.loadFromStorage();
      this.refresh();
    }
  }

  private async pinToScope(uri: vscode.Uri | undefined, targetScope: 'global' | 'workspace'): Promise<void> {
    let itemPath: string;
    if (uri) {
      itemPath = uri.fsPath;
    } else {
      const result = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Pin',
      });
      if (!result || result.length === 0) return;
      itemPath = result[0].fsPath;
    }

    const targetStorage = this.storageFor(targetScope);

    const existing = targetStorage.get<Pin[]>(STATE_KEY, []);
    if (existing.some(p => p.path === itemPath)) return;

    await targetStorage.update(STATE_KEY, [...existing, { path: itemPath }]);
    this.syncPinContextKeys();

    if (targetScope === this.getScope()) {
      this.pins = this.loadFromStorage();
      this.refresh();
    }
  }

  private dropSetting(): 'ask' | 'reorder' | 'move' {
    return vscode.workspace
      .getConfiguration('pinboard')
      .get<'ask' | 'reorder' | 'move'>('dropOnPinnedFolder', 'ask');
  }

  private async chooseDropAction(target: PinnedItemRoot, placeAfter: boolean): Promise<'reorder' | 'move' | undefined> {
    const setting = this.dropSetting();
    if (setting !== 'ask') return setting;
    const name = typeof target.label === 'string' ? target.label : path.basename(target.itemPath);
    const picked = await vscode.window.showQuickPick(
      [
        { label: `Reorder ${placeAfter ? 'after' : 'before'} "${name}"`, action: 'reorder' as const },
        { label: `Move into "${name}"`, action: 'move' as const },
      ],
      { placeHolder: 'Reorder the pinned item, or move it into the folder?' }
    );
    return picked?.action;
  }

  private async transferViaPicker(item: FileSystemItem | PinnedItemRoot, mode: 'move' | 'copy'): Promise<void> {
    const name = path.basename(item.itemPath);
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: vscode.Uri.file(path.dirname(item.itemPath)),
      openLabel: mode === 'move' ? 'Move Here' : 'Copy Here',
      title: `${mode === 'move' ? 'Move' : 'Copy'} "${name}" to…`,
    });
    if (!uris || uris.length === 0) return;
    if (await this.transferItem(item.itemPath, uris[0].fsPath, mode)) {
      await this.commit();
    }
  }

  private async dropItems(target: AnyItem | undefined, sources: string[], skipConfirm = false): Promise<void> {
    if (!target) return;
    const destDir = target.isDirectory
      ? target.itemPath
      : target.kind === 'fsitem' ? path.dirname(target.itemPath) : undefined;
    if (!destDir) return;
    await this.moveIntoFolder(destDir, sources, skipConfirm);
  }

  private async dropOnEmptySpace(sources: string[]): Promise<void> {
    const root = this.getWorkspaceRoot();
    const items: Array<{ label: string; action: 'root' | 'pick' }> = [];
    if (root && sources.some(p => path.dirname(p) !== root)) {
      items.push({ label: `Move to workspace root "${path.basename(root)}"`, action: 'root' });
    }
    items.push({ label: 'Move to another folder…', action: 'pick' });
    const what = sources.length === 1 ? `"${path.basename(sources[0])}"` : `${sources.length} items`;
    const picked = await vscode.window.showQuickPick(items, { placeHolder: `Move ${what} to…` });
    if (!picked) return;
    if (picked.action === 'root' && root) {
      await this.moveIntoFolder(root, sources, true);
      return;
    }
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: vscode.Uri.file(path.dirname(sources[0])),
      openLabel: 'Move Here',
      title: `Move ${what} to…`,
    });
    if (!uris || uris.length === 0) return;
    await this.moveIntoFolder(uris[0].fsPath, sources, true);
  }

  private async moveIntoFolder(destDir: string, sources: string[], skipConfirm: boolean): Promise<void> {
    const movable = sources
      .filter(p => path.dirname(p) !== destDir)
      .filter((p, _i, all) => !all.some(o => o !== p && p.startsWith(o + path.sep)));
    if (movable.length === 0) return;
    const confirm = vscode.workspace
      .getConfiguration('explorer')
      .get<boolean>('confirmDragAndDrop', true);
    if (confirm && !skipConfirm) {
      const what = movable.length === 1 ? `"${path.basename(movable[0])}"` : `${movable.length} items`;
      const answer = await vscode.window.showWarningMessage(
        `Move ${what} into "${path.basename(destDir)}"?`,
        { modal: true },
        'Move'
      );
      if (answer !== 'Move') return;
    }
    let changed = false;
    for (const source of movable) {
      if (await this.transferItem(source, destDir, 'move')) changed = true;
    }
    if (changed) await this.commit();
  }

  private async transferItem(source: string, destDir: string, mode: 'move' | 'copy'): Promise<boolean> {
    const name = path.basename(source);
    const target = path.join(destDir, name);
    if (target === source) {
      if (mode === 'copy') {
        vscode.window.showInformationMessage(`"${name}" is already in that folder.`);
      }
      return false;
    }
    if (destDir === source || destDir.startsWith(source + path.sep) || source.startsWith(target + path.sep)) {
      vscode.window.showErrorMessage(`Cannot ${mode} "${name}" to that location.`);
      return false;
    }
    // Resolved before the operation: afterwards the source no longer exists. Pins to the same
    // folder can be spelled differently (symlinks such as /tmp vs /private/tmp).
    const realOf = mode === 'move' ? this.snapshotRealPaths() : undefined;
    const realSource = realOf ? realPathOrSelf(source) : source;
    const sourceUri = vscode.Uri.file(source);
    const targetUri = vscode.Uri.file(target);
    let exists = true;
    try { await vscode.workspace.fs.stat(targetUri); } catch { exists = false; }
    if (exists) {
      const answer = await vscode.window.showWarningMessage(
        `"${name}" already exists in "${path.basename(destDir)}". Replace it?`,
        { modal: true, detail: 'The existing item will be moved to the Trash.' },
        'Replace'
      );
      if (answer !== 'Replace') return false;
      try {
        await this.trashItem(targetUri);
      } catch {
        vscode.window.showErrorMessage(`Could not move the existing "${name}" to the Trash. Nothing was changed.`);
        return false;
      }
    }
    try {
      if (mode === 'copy') {
        await vscode.workspace.fs.copy(sourceUri, targetUri, { overwrite: false });
      } else {
        const edit = new vscode.WorkspaceEdit();
        edit.renameFile(sourceUri, targetUri, { overwrite: false });
        if (!(await vscode.workspace.applyEdit(edit))) throw new Error('the move was rejected');
      }
    } catch (err) {
      const note = exists ? ' The existing item is in the Trash.' : '';
      vscode.window.showErrorMessage(`Failed to ${mode}: ${err instanceof Error ? err.message : String(err)}.${note}`);
      return false;
    }
    await this.updatePinsAfterTransfer(source, realSource, realOf, target, mode, exists);
    return true;
  }

  private snapshotRealPaths(): (p: string) => string {
    const cache = new Map<string, string>();
    for (const pins of [
      this.pins,
      this.context.globalState.get<Pin[]>(STATE_KEY, []),
      this.context.workspaceState.get<Pin[]>(STATE_KEY, []),
    ]) {
      for (const pin of pins) cache.set(pin.path, realPathOrSelf(pin.path));
    }
    return p => cache.get(p) ?? p;
  }

  private async updatePinsAfterTransfer(
    source: string,
    realSource: string,
    realOf: ((p: string) => string) | undefined,
    target: string,
    mode: 'move' | 'copy',
    replaced: boolean
  ): Promise<void> {
    if (mode === 'copy' && !replaced) return;
    const apply = (pins: Pin[]): Pin[] => {
      const seen = new Set<string>();
      return pins
        .map(p => {
          if (mode !== 'move') return p;
          const real = realOf ? realOf(p.path) : p.path;
          if (p.path === source || real === realSource) return { ...p, path: target };
          if (p.path.startsWith(source + path.sep)) {
            return { ...p, path: target + p.path.slice(source.length) };
          }
          if (real.startsWith(realSource + path.sep)) {
            return { ...p, path: target + real.slice(realSource.length) };
          }
          return p;
        })
        .filter(p => !(replaced && p.path.startsWith(target + path.sep) && !pathExists(p.path)))
        .filter(p => !seen.has(p.path) && !!seen.add(p.path));
    };
    this.pins = apply(this.pins);
    const other = this.storageFor(this.getScope() === 'workspace' ? 'global' : 'workspace');
    const otherPins = other.get<Pin[]>(STATE_KEY, []);
    const updated = apply(otherPins);
    if (JSON.stringify(updated) !== JSON.stringify(otherPins)) {
      await other.update(STATE_KEY, updated);
    }
  }

  async trashItem(uri: vscode.Uri): Promise<void> {
    await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: true });
  }

  private async commit(): Promise<void> {
    await this.persist();
    this.syncPinContextKeys();
    this.refresh();
  }

  isSorted(): boolean {
    return vscode.workspace
      .getConfiguration('pinboard')
      .get<'manual' | 'alias'>('sortPins', 'manual') === 'alias';
  }

  private viewPins(): Pin[] {
    if (!this.isSorted()) return this.pins;
    const label = (pin: Pin) => this.getLabelForPath(pin);
    return [...this.pins].sort((a, b) =>
      label(a).localeCompare(label(b), undefined, { sensitivity: 'base' })
    );
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
