import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const STATE_KEY = 'pinboard.paths';
const DND_MIME = 'application/vscode.tree.pinboard';

function isDirectory(p: string): boolean {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function pathExists(p: string): boolean {
  try { fs.statSync(p); return true; } catch { return false; }
}

export class PinnedItemRoot extends vscode.TreeItem {
  readonly kind = 'root' as const;

  constructor(
    public readonly itemPath: string,
    public readonly isDirectory: boolean,
    isCurrentWorkspace: boolean,
    position: 'single' | 'first' | 'middle' | 'last'
  ) {
    super(
      path.basename(itemPath),
      isDirectory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    this.tooltip = itemPath;
    this.resourceUri = vscode.Uri.file(itemPath);

    if (isDirectory) {
      const base = isCurrentWorkspace ? 'pinnedFolderActive' : 'pinnedFolder';
      this.contextValue = `${base}${capitalize(position)}`;
    } else {
      this.contextValue = `pinnedFileRoot${capitalize(position)}`;
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

  private pinnedPaths: string[];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.pinnedPaths = this.loadFromStorage();
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

  private loadFromStorage(): string[] {
    const paths = this.storage.get<string[]>(STATE_KEY, []);
    const valid = paths.filter(pathExists);
    if (valid.length !== paths.length) {
      this.storage.update(STATE_KEY, valid);
    }
    return valid;
  }

  onScopeChanged(): void {
    this.pinnedPaths = this.loadFromStorage();
    this.refresh();
  }

  // ── TreeDataProvider ───────────────────────────────────────────────────────

  getTreeItem(element: AnyItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AnyItem): AnyItem[] {
    if (!element) {
      const openPaths = new Set(
        (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath)
      );
      return this.pinnedPaths.map((p, index) => {
        const dir = isDirectory(p);
        return new PinnedItemRoot(
          p,
          dir,
          openPaths.has(p),
          this.getPinnedItemPosition(index)
        );
      });
    }

    // File roots and nested files have no children
    if (element.kind === 'root' && !element.isDirectory) return [];

    const dirPath = element.itemPath;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
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

  // ── DnD ───────────────────────────────────────────────────────────────────

  handleDrag(source: readonly AnyItem[], dataTransfer: vscode.DataTransfer): void {
    const roots = source.filter((i): i is PinnedItemRoot => i.kind === 'root');
    if (roots.length === 0) return;
    dataTransfer.set(
      DND_MIME,
      new vscode.DataTransferItem(roots.map(r => r.itemPath))
    );
  }

  handleDrop(target: AnyItem | undefined, dataTransfer: vscode.DataTransfer): void {
    const item = dataTransfer.get(DND_MIME);
    if (!item) return;
    const dragged: string[] = item.value;
    const remaining = this.pinnedPaths.filter(p => !dragged.includes(p));
    const dropPath = target?.kind === 'root' ? target.itemPath : undefined;
    if (dropPath) {
      const insertAt = remaining.indexOf(dropPath);
      if (insertAt >= 0) {
        remaining.splice(insertAt, 0, ...dragged);
      } else {
        remaining.push(...dragged);
      }
    } else {
      remaining.push(...dragged);
    }
    this.pinnedPaths = remaining;
    this.persist();
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
      if (!this.pinnedPaths.includes(uri.fsPath)) {
        this.pinnedPaths.push(uri.fsPath);
        changed = true;
      }
    }
    if (changed) { this.persist(); this.refresh(); }
  }

  removeItem(item: PinnedItemRoot): void {
    this.pinnedPaths = this.pinnedPaths.filter(p => p !== item.itemPath);
    this.persist();
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
    if (!newName || newName === oldName) return;
    const newItemPath = path.join(path.dirname(item.itemPath), newName);
    await vscode.workspace.fs.rename(
      vscode.Uri.file(item.itemPath),
      vscode.Uri.file(newItemPath)
    );
    this.pinnedPaths = this.pinnedPaths.map(p =>
      p === item.itemPath ? newItemPath : p
    );
    this.persist();
    this.refresh();
  }

  async deletePinnedItem(item: PinnedItemRoot): Promise<void> {
    const name = path.basename(item.itemPath);
    const label = item.isDirectory ? `Delete "${name}" and all its contents?` : `Delete "${name}"?`;
    const answer = await vscode.window.showWarningMessage(label, { modal: true }, 'Move to Trash');
    if (answer !== 'Move to Trash') return;
    await vscode.workspace.fs.delete(vscode.Uri.file(item.itemPath), {
      recursive: true,
      useTrash: true,
    });
    this.pinnedPaths = this.pinnedPaths.filter(p => p !== item.itemPath);
    this.persist();
    this.refresh();
  }

  openInNewWindow(item: PinnedItemRoot): void {
    vscode.commands.executeCommand(
      'vscode.openFolder',
      vscode.Uri.file(item.itemPath),
      { forceNewWindow: true }
    );
  }

  moveItemUp(item: PinnedItemRoot): void {
    const index = this.pinnedPaths.indexOf(item.itemPath);
    if (index <= 0) return;
    const reordered = [...this.pinnedPaths];
    [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
    this.pinnedPaths = reordered;
    this.persist();
    this.refresh();
  }

  moveItemDown(item: PinnedItemRoot): void {
    const index = this.pinnedPaths.indexOf(item.itemPath);
    if (index < 0 || index >= this.pinnedPaths.length - 1) return;
    const reordered = [...this.pinnedPaths];
    [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
    this.pinnedPaths = reordered;
    this.persist();
    this.refresh();
  }

  pinFromExplorer(uri: vscode.Uri): void {
    if (!this.pinnedPaths.includes(uri.fsPath)) {
      this.pinnedPaths.push(uri.fsPath);
      this.persist();
      this.refresh();
    }
  }

  // ── File / directory commands ──────────────────────────────────────────────

  async openToSide(item: FileSystemItem | PinnedItemRoot): Promise<void> {
    const p = item.kind === 'root' ? item.itemPath : item.itemPath;
    await vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.file(p),
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
    if (!newName || newName === oldName) return;
    const newPath = path.join(path.dirname(item.itemPath), newName);
    await vscode.workspace.fs.rename(
      vscode.Uri.file(item.itemPath),
      vscode.Uri.file(newPath)
    );
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
    await vscode.workspace.fs.delete(vscode.Uri.file(item.itemPath), {
      recursive: true,
      useTrash: true,
    });
    this.refresh();
  }

  async newFile(item: FileSystemItem | PinnedItemRoot): Promise<void> {
    const dirPath = item.itemPath;
    const name = await vscode.window.showInputBox({ prompt: 'New file name' });
    if (!name?.trim()) return;
    const newPath = path.join(dirPath, name.trim());
    await vscode.workspace.fs.writeFile(vscode.Uri.file(newPath), new Uint8Array());
    this.refresh();
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(newPath));
  }

  async newFolder(item: FileSystemItem | PinnedItemRoot): Promise<void> {
    const dirPath = item.itemPath;
    const name = await vscode.window.showInputBox({ prompt: 'New folder name' });
    if (!name?.trim()) return;
    const newPath = path.join(dirPath, name.trim());
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(newPath));
    this.refresh();
  }

  openInTerminal(item: FileSystemItem | PinnedItemRoot): void {
    const dirPath = item.isDirectory ? item.itemPath : path.dirname(item.itemPath);
    const terminal = vscode.window.createTerminal({ cwd: dirPath });
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

  // ── Helpers ────────────────────────────────────────────────────────────────

  isEmpty(): boolean {
    return this.pinnedPaths.length === 0;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  private persist(): void {
    this.storage.update(STATE_KEY, this.pinnedPaths);
  }

  private getPinnedItemPosition(index: number): 'single' | 'first' | 'middle' | 'last' {
    if (this.pinnedPaths.length === 1) return 'single';
    if (index === 0) return 'first';
    if (index === this.pinnedPaths.length - 1) return 'last';
    return 'middle';
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
