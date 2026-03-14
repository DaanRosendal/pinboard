import * as vscode from 'vscode';
import { FileSystemItem, PinnedItemRoot, PinboardProvider } from './PinboardProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new PinboardProvider(context);

  const treeView = vscode.window.createTreeView('pinboard', {
    treeDataProvider: provider,
    dragAndDropController: provider,
    showCollapseAll: true,
    canSelectMany: false,
  });

  const syncView = () => {
    treeView.message = provider.isEmpty()
      ? 'No pinned items. Click + to add a file or folder.'
      : undefined;
    treeView.description = provider.getScope() === 'workspace' ? 'Workspace' : 'Global';
  };

  const syncScopeContext = () => {
    vscode.commands.executeCommand(
      'setContext',
      'pinboard.isGlobalScope',
      provider.getScope() === 'global'
    );
  };

  syncView();
  syncScopeContext();
  provider.onDidChangeTreeData(syncView);

  context.subscriptions.push(
    treeView,

    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh()),

    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('pinboard.scope')) {
        provider.onScopeChanged();
        syncScopeContext();
      }
    }),

    vscode.commands.registerCommand('pinboard.refresh', () =>
      provider.refresh()
    ),
    vscode.commands.registerCommand('pinboard.addFolder', () =>
      provider.addItem()
    ),
    vscode.commands.registerCommand('pinboard.unpinFolder', (item: PinnedItemRoot) =>
      provider.removeItem(item)
    ),
    vscode.commands.registerCommand('pinboard.unpinFile', (item: PinnedItemRoot) =>
      provider.removeItem(item)
    ),
    vscode.commands.registerCommand('pinboard.renamePinnedFolder', (item: PinnedItemRoot) =>
      provider.renamePinnedItem(item)
    ),
    vscode.commands.registerCommand('pinboard.deletePinnedFolder', (item: PinnedItemRoot) =>
      provider.deletePinnedItem(item)
    ),
    vscode.commands.registerCommand('pinboard.openInNewWindow', (item: PinnedItemRoot) =>
      provider.openInNewWindow(item)
    ),
    vscode.commands.registerCommand('pinboard.moveUp', (item: PinnedItemRoot) =>
      provider.moveItemUp(item)
    ),
    vscode.commands.registerCommand('pinboard.moveDown', (item: PinnedItemRoot) =>
      provider.moveItemDown(item)
    ),
    vscode.commands.registerCommand('pinboard.alreadyOpen', () => {
      // intentionally does nothing — icon signals the folder is already open
    }),
    vscode.commands.registerCommand('pinboard.pinFromExplorer', (uri: vscode.Uri) =>
      provider.pinFromExplorer(uri)
    ),

    vscode.commands.registerCommand('pinboard.switchToWorkspace', () => {
      vscode.workspace
        .getConfiguration('pinboard')
        .update('scope', 'workspace', vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand('pinboard.switchToGlobal', () => {
      vscode.workspace
        .getConfiguration('pinboard')
        .update('scope', 'global', vscode.ConfigurationTarget.Global);
    }),

    vscode.commands.registerCommand('pinboard.openToSide', (item: FileSystemItem | PinnedItemRoot) =>
      provider.openToSide(item)
    ),
    vscode.commands.registerCommand('pinboard.revealInOS', (item: FileSystemItem | PinnedItemRoot) =>
      provider.revealInOS(item)
    ),
    vscode.commands.registerCommand('pinboard.copyPath', (item: FileSystemItem | PinnedItemRoot) =>
      provider.copyPath(item)
    ),
    vscode.commands.registerCommand('pinboard.rename', (item: FileSystemItem) =>
      provider.rename(item)
    ),
    vscode.commands.registerCommand('pinboard.deleteItem', (item: FileSystemItem) =>
      provider.deleteItem(item)
    ),
    vscode.commands.registerCommand('pinboard.newFile', (item: FileSystemItem | PinnedItemRoot) =>
      provider.newFile(item)
    ),
    vscode.commands.registerCommand('pinboard.newFolder', (item: FileSystemItem | PinnedItemRoot) =>
      provider.newFolder(item)
    ),
    vscode.commands.registerCommand('pinboard.openInTerminal', (item: FileSystemItem | PinnedItemRoot) =>
      provider.openInTerminal(item)
    ),
    vscode.commands.registerCommand('pinboard.findInFolder', (item: FileSystemItem | PinnedItemRoot) =>
      provider.findInFolder(item)
    ),
    vscode.commands.registerCommand('pinboard.copyRelativePath', (item: FileSystemItem | PinnedItemRoot) =>
      provider.copyRelativePath(item)
    ),
  );
}

export function deactivate(): void {}
