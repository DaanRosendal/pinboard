import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { PinboardProvider, PinnedItemRoot, FileSystemItem, Pin } from '../../PinboardProvider';
import { createMockContext, makeTempDir, removeTempDir } from '../helpers';

const STATE_KEY = 'pinboard.paths';

suite('PinboardProvider', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  // ── getPinnedItemPosition (via contextValues from getChildren) ─────────────

  suite('getPinnedItemPosition', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('single item → contextValue ends with Single', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.ok(items[0].contextValue?.endsWith('Single'));
    });

    test('first of two → contextValue ends with First', async () => {
      const dirA = path.join(tmpDir, 'a');
      const dirB = path.join(tmpDir, 'b');
      fs.mkdirSync(dirA);
      fs.mkdirSync(dirB);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }, { path: dirB }]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.ok(items[0].contextValue?.endsWith('First'));
    });

    test('last of two → contextValue ends with Last', async () => {
      const dirA = path.join(tmpDir, 'a');
      const dirB = path.join(tmpDir, 'b');
      fs.mkdirSync(dirA);
      fs.mkdirSync(dirB);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }, { path: dirB }]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.ok(items[1].contextValue?.endsWith('Last'));
    });

    test('middle of three → contextValue ends with Middle', async () => {
      const [a, b, c] = ['a', 'b', 'c'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: a }, { path: b }, { path: c }]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.ok(items[1].contextValue?.endsWith('Middle'));
    });

    test('active folder → contextValue contains Active', async () => {
      const wsFolderPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsFolderPath) { return; }
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: wsFolderPath }]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.ok(items[0].contextValue?.includes('Active'));
    });
  });

  // ── loadFromStorage ────────────────────────────────────────────────────────

  suite('loadFromStorage', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('loads valid paths on construction', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.strictEqual(items.length, 1);
      assert.strictEqual((items[0] as PinnedItemRoot).itemPath, dirA);
    });

    test('filters out non-existent paths and persists cleaned list', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const nonexistent = path.join(tmpDir, 'nonexistent');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }, { path: nonexistent }]);
      new PinboardProvider(ctx);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: dirA }]);
    });

    test('starts empty when globalState has no data', async () => {
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.strictEqual(items.length, 0);
    });
  });

  // ── getChildren (nested) ───────────────────────────────────────────────────

  suite('getChildren (nested)', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('returns dirs-first, alphabetically sorted entries', async () => {
      fs.writeFileSync(path.join(tmpDir, 'b-file.txt'), '');
      fs.mkdirSync(path.join(tmpDir, 'a-dir'));
      fs.writeFileSync(path.join(tmpDir, 'c-file.txt'), '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: tmpDir }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      const children = await provider.getChildren(roots[0] as PinnedItemRoot);
      assert.strictEqual(children.length, 3);
      assert.strictEqual(path.basename((children[0] as FileSystemItem).itemPath), 'a-dir');
      assert.strictEqual(path.basename((children[1] as FileSystemItem).itemPath), 'b-file.txt');
      assert.strictEqual(path.basename((children[2] as FileSystemItem).itemPath), 'c-file.txt');
    });

    test('includes dotfiles and dot-folders', async () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), '');
      fs.writeFileSync(path.join(tmpDir, '.gitignore'), '');
      fs.mkdirSync(path.join(tmpDir, '.github'));
      fs.writeFileSync(path.join(tmpDir, 'visible.txt'), '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: tmpDir }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      const children = await provider.getChildren(roots[0] as PinnedItemRoot);
      assert.deepStrictEqual(
        children.map(c => path.basename((c as FileSystemItem).itemPath)),
        ['.github', '.env', '.gitignore', 'visible.txt']
      );
    });

    test('excludes VCS folders and OS metadata files', async () => {
      for (const dir of ['.git', '.svn', '.hg', '.jj']) {
        fs.mkdirSync(path.join(tmpDir, dir));
      }
      fs.writeFileSync(path.join(tmpDir, '.DS_Store'), '');
      fs.writeFileSync(path.join(tmpDir, 'Thumbs.db'), '');
      fs.writeFileSync(path.join(tmpDir, '.env'), '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: tmpDir }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      const children = await provider.getChildren(roots[0] as PinnedItemRoot);
      assert.deepStrictEqual(
        children.map(c => path.basename((c as FileSystemItem).itemPath)),
        ['.env']
      );
    });

    test('returns [] for a file root item', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: filePath }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      const children = await provider.getChildren(roots[0] as PinnedItemRoot);
      assert.strictEqual(children.length, 0);
    });

    test('returns [] when directory read fails', async () => {
      const nonexistentDir = path.join(tmpDir, 'nonexistent');
      const root = new PinnedItemRoot(nonexistentDir, true, false, 'single', path.basename(nonexistentDir), false);
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      const children = await provider.getChildren(root);
      assert.strictEqual(children.length, 0);
    });
  });

  // ── handleDrag / handleDrop ────────────────────────────────────────────────

  suite('handleDrag / handleDrop', () => {
    let tmpDir: string;
    const MIME = 'application/vscode.tree.pinboard';

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('drag encodes only PinnedItemRoot items, ignores FileSystemItems', () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const root = new PinnedItemRoot(dirA, true, false, 'single', path.basename(dirA), false);
      const fsItem = new FileSystemItem(path.join(dirA, 'x'), false);
      const dt = new vscode.DataTransfer();
      new PinboardProvider(createMockContext()).handleDrag([root, fsItem], dt);
      const item = dt.get(MIME);
      assert.ok(item);
      assert.deepStrictEqual(item.value, [dirA]);
    });

    test('drag does nothing when source has no root items', () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const fsItem = new FileSystemItem(path.join(dirA, 'x'), false);
      const dt = new vscode.DataTransfer();
      new PinboardProvider(createMockContext()).handleDrag([fsItem], dt);
      assert.strictEqual(dt.get(MIME), undefined);
    });

    test('drop moves dragged item to position before target', async () => {
      const [a, b, c] = ['a', 'b', 'c'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: a }, { path: b }, { path: c }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      provider.handleDrag([roots[2] as PinnedItemRoot], dt); // drag C
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt); // drop onto B
      const after = await provider.getChildren(undefined);
      assert.deepStrictEqual(after.map(i => (i as PinnedItemRoot).itemPath), [a, c, b]);
    });

    test('drop appends to end when target is undefined', async () => {
      const [a, b, c] = ['a', 'b', 'c'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: a }, { path: b }, { path: c }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      provider.handleDrag([roots[0] as PinnedItemRoot], dt); // drag A
      await provider.handleDrop(undefined, dt);
      const after = await provider.getChildren(undefined);
      assert.deepStrictEqual(after.map(i => (i as PinnedItemRoot).itemPath), [b, c, a]);
    });

    test('drop is no-op when DataTransfer has no matching MIME', async () => {
      const [a, b] = ['a', 'b'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: a }, { path: b }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      await provider.handleDrop(roots[0] as PinnedItemRoot, dt);
      const after = await provider.getChildren(undefined);
      assert.deepStrictEqual(after.map(i => (i as PinnedItemRoot).itemPath), [a, b]);
    });

  });

  // ── addItem ────────────────────────────────────────────────────────────────

  suite('addItem', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('pins a path from showOpenDialog result', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showOpenDialog').resolves([vscode.Uri.file(filePath)]);
      await provider.addItem();
      const items = await provider.getChildren(undefined);
      assert.strictEqual(items.length, 1);
      assert.strictEqual((items[0] as PinnedItemRoot).itemPath, filePath);
    });

    test('no duplicate when pinning same path twice', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showOpenDialog').resolves([vscode.Uri.file(filePath)]);
      await provider.addItem();
      await provider.addItem();
      const items = await provider.getChildren(undefined);
      assert.strictEqual(items.length, 1);
    });

    test('no-op when dialog is cancelled', async () => {
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showOpenDialog').resolves(undefined);
      await provider.addItem();
      const items = await provider.getChildren(undefined);
      assert.strictEqual(items.length, 0);
    });

    test('pins multiple paths when dialog returns several URIs', async () => {
      const fileA = path.join(tmpDir, 'a.txt');
      const fileB = path.join(tmpDir, 'b.txt');
      fs.writeFileSync(fileA, '');
      fs.writeFileSync(fileB, '');
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showOpenDialog').resolves([vscode.Uri.file(fileA), vscode.Uri.file(fileB)]);
      await provider.addItem();
      const items = await provider.getChildren(undefined);
      assert.strictEqual(items.length, 2);
    });
  });

  // ── removeItem ─────────────────────────────────────────────────────────────

  suite('removeItem', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('removes the specified item from storage', async () => {
      const pathA = path.join(tmpDir, 'a');
      const pathB = path.join(tmpDir, 'b');
      fs.mkdirSync(pathA);
      fs.mkdirSync(pathB);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: pathA }, { path: pathB }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      await provider.removeItem(roots[0] as PinnedItemRoot);
      const remaining = await provider.getChildren(undefined);
      assert.strictEqual(remaining.length, 1);
      assert.strictEqual((remaining[0] as PinnedItemRoot).itemPath, pathB);
    });

    test('alias is removed with the pin when item is unpinned', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA, alias: 'My Alias' }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      await provider.removeItem(roots[0] as PinnedItemRoot);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, []);
    });
  });

  // ── moveItemUp / moveItemDown ──────────────────────────────────────────────

  suite('moveItemUp / moveItemDown', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    async function makeProvider(pins: Pin[]): Promise<PinboardProvider> {
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, pins);
      return new PinboardProvider(ctx);
    }

    test('moveUp swaps item with predecessor', async () => {
      const [a, b, c] = ['a', 'b', 'c'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const provider = await makeProvider([{ path: a }, { path: b }, { path: c }]);
      const roots = await provider.getChildren(undefined);
      await provider.moveItemUp(roots[1] as PinnedItemRoot);
      const after = await provider.getChildren(undefined);
      assert.deepStrictEqual(after.map(i => (i as PinnedItemRoot).itemPath), [b, a, c]);
    });

    test('moveUp is no-op when already first', async () => {
      const [a, b] = ['a', 'b'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const provider = await makeProvider([{ path: a }, { path: b }]);
      const roots = await provider.getChildren(undefined);
      await provider.moveItemUp(roots[0] as PinnedItemRoot);
      const after = await provider.getChildren(undefined);
      assert.deepStrictEqual(after.map(i => (i as PinnedItemRoot).itemPath), [a, b]);
    });

    test('moveDown swaps item with successor', async () => {
      const [a, b, c] = ['a', 'b', 'c'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const provider = await makeProvider([{ path: a }, { path: b }, { path: c }]);
      const roots = await provider.getChildren(undefined);
      await provider.moveItemDown(roots[1] as PinnedItemRoot);
      const after = await provider.getChildren(undefined);
      assert.deepStrictEqual(after.map(i => (i as PinnedItemRoot).itemPath), [a, c, b]);
    });

    test('moveDown is no-op when already last', async () => {
      const [a, b] = ['a', 'b'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const provider = await makeProvider([{ path: a }, { path: b }]);
      const roots = await provider.getChildren(undefined);
      await provider.moveItemDown(roots[1] as PinnedItemRoot);
      const after = await provider.getChildren(undefined);
      assert.deepStrictEqual(after.map(i => (i as PinnedItemRoot).itemPath), [a, b]);
    });
  });

  // ── pinFromExplorer ────────────────────────────────────────────────────────

  suite('pinFromExplorer', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('adds uri.fsPath when not already pinned', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      await provider.pinFromExplorer(vscode.Uri.file(dirA));
      const items = await provider.getChildren(undefined);
      assert.strictEqual(items.length, 1);
      assert.strictEqual((items[0] as PinnedItemRoot).itemPath, dirA);
    });

    test('no duplicate when already pinned, showOpenDialog not called', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      const showOpenDialog = sandbox.stub(vscode.window, 'showOpenDialog');
      await provider.pinFromExplorer(vscode.Uri.file(dirA));
      const items = await provider.getChildren(undefined);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(showOpenDialog.callCount, 0);
    });

    test('falls back to addItem when uri is undefined', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showOpenDialog').resolves([vscode.Uri.file(filePath)]);
      await provider.pinFromExplorer(undefined);
      const items = await provider.getChildren(undefined);
      assert.strictEqual(items.length, 1);
    });
  });

  // ── renamePinnedItem ───────────────────────────────────────────────────────

  suite('renamePinnedItem', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('renames file on disk and updates storage', async () => {
      const oldPath = path.join(tmpDir, 'oldname.txt');
      fs.writeFileSync(oldPath, '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: oldPath }]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showInputBox').resolves('newname.txt');
      const roots = await provider.getChildren(undefined);
      await provider.renamePinnedItem(roots[0] as PinnedItemRoot);
      const newPath = path.join(tmpDir, 'newname.txt');
      assert.ok(fs.existsSync(newPath));
      assert.ok(!fs.existsSync(oldPath));
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: newPath }]);
    });

    test('no-op when input box is cancelled', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: filePath }]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showInputBox').resolves(undefined);
      const roots = await provider.getChildren(undefined);
      await provider.renamePinnedItem(roots[0] as PinnedItemRoot);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: filePath }]);
    });

    test('no-op when new name equals old name', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: filePath }]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showInputBox').resolves('file.txt');
      const roots = await provider.getChildren(undefined);
      await provider.renamePinnedItem(roots[0] as PinnedItemRoot);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: filePath }]);
    });

    test('shows error and does not update storage when rename throws', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: filePath }]);
      const provider = new PinboardProvider(ctx);
      // Delete the file after loading so vscode.workspace.fs.rename fails (source not found)
      fs.unlinkSync(filePath);
      sandbox.stub(vscode.window, 'showInputBox').resolves('newname.txt');
      const showError = sandbox.stub(vscode.window, 'showErrorMessage');
      const item = new PinnedItemRoot(filePath, false, false, 'single', path.basename(filePath), false);
      await provider.renamePinnedItem(item);
      assert.ok(showError.calledOnce);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: filePath }]);
    });

    test('alias is preserved after rename', async () => {
      const oldPath = path.join(tmpDir, 'oldname.txt');
      fs.writeFileSync(oldPath, '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: oldPath, alias: 'My File' }]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showInputBox').resolves('newname.txt');
      const roots = await provider.getChildren(undefined);
      await provider.renamePinnedItem(roots[0] as PinnedItemRoot);
      const newPath = path.join(tmpDir, 'newname.txt');
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: newPath, alias: 'My File' }]);
    });
  });

  // ── deletePinnedItem ───────────────────────────────────────────────────────

  suite('deletePinnedItem', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('removes item from storage after confirmation', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: filePath }]);
      const provider = new PinboardProvider(ctx);
      (sandbox.stub(vscode.window, 'showWarningMessage') as sinon.SinonStub).resolves('Move to Trash');
      // Use real vscode.workspace.fs.delete (moves to trash); just assert storage is cleared
      const roots = await provider.getChildren(undefined);
      await provider.deletePinnedItem(roots[0] as PinnedItemRoot);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, []);
    });

    test('no-op when modal is dismissed', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: filePath }]);
      const provider = new PinboardProvider(ctx);
      (sandbox.stub(vscode.window, 'showWarningMessage') as sinon.SinonStub).resolves(undefined);
      const roots = await provider.getChildren(undefined);
      await provider.deletePinnedItem(roots[0] as PinnedItemRoot);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: filePath }]);
    });
  });

  // ── readPresets ────────────────────────────────────────────────────────────

  suite('readPresets', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    function makeProvider(root: string): PinboardProvider {
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sandbox.stub(provider as any, 'getWorkspaceRoot').returns(root);
      return provider;
    }

    test('returns null when .pinboard.json does not exist', () => {
      const provider = makeProvider(tmpDir);
      assert.strictEqual(provider.readPresets(), null);
    });

    test('returns parsed presets from valid .pinboard.json with string paths', () => {
      const json = JSON.stringify({ presets: [{ name: 'dev', paths: ['src', 'tests'] }] });
      fs.writeFileSync(path.join(tmpDir, '.pinboard.json'), json);
      const provider = makeProvider(tmpDir);
      const result = provider.readPresets();
      assert.ok(result !== null);
      assert.strictEqual(result!.length, 1);
      assert.strictEqual(result![0].name, 'dev');
      assert.deepStrictEqual(result![0].paths, ['src', 'tests']);
    });

    test('returns parsed presets from valid .pinboard.json with object paths', () => {
      const json = JSON.stringify({ presets: [{ name: 'dev', paths: [{ path: 'src', alias: 'Source' }, 'tests'] }] });
      fs.writeFileSync(path.join(tmpDir, '.pinboard.json'), json);
      const provider = makeProvider(tmpDir);
      const result = provider.readPresets();
      assert.ok(result !== null);
      assert.deepStrictEqual(result![0].paths, [{ path: 'src', alias: 'Source' }, 'tests']);
    });

    test('returns null when JSON is malformed', () => {
      fs.writeFileSync(path.join(tmpDir, '.pinboard.json'), 'not json{{{');
      const provider = makeProvider(tmpDir);
      assert.strictEqual(provider.readPresets(), null);
    });

    test('returns null when presets entries have wrong types', () => {
      const json = JSON.stringify({ presets: [{ name: 123, paths: ['src'] }] });
      fs.writeFileSync(path.join(tmpDir, '.pinboard.json'), json);
      const provider = makeProvider(tmpDir);
      assert.strictEqual(provider.readPresets(), null);
    });

    test('returns null when presets array is empty', () => {
      const json = JSON.stringify({ presets: [] });
      fs.writeFileSync(path.join(tmpDir, '.pinboard.json'), json);
      const provider = makeProvider(tmpDir);
      assert.strictEqual(provider.readPresets(), null);
    });
  });

  // ── applyPreset ────────────────────────────────────────────────────────────

  suite('applyPreset', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('resolves relative paths to absolute and filters nonexistent', async () => {
      const realDir = path.join(tmpDir, 'real-sub');
      fs.mkdirSync(realDir);
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sandbox.stub(provider as any, 'getWorkspaceRoot').returns(tmpDir);
      sandbox.stub(provider, 'getScope').returns('workspace');
      await provider.applyPreset({ name: 'test', paths: ['real-sub', 'nonexistent'] });
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: realDir }]);
    });

    test('does nothing when scope is global', async () => {
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      sandbox.stub(provider, 'getScope').returns('global');
      await provider.applyPreset({ name: 'test', paths: ['src'] });
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, []);
    });

    test('fires onDidChangeTreeData after applying', async () => {
      const realDir = path.join(tmpDir, 'sub');
      fs.mkdirSync(realDir);
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sandbox.stub(provider as any, 'getWorkspaceRoot').returns(tmpDir);
      sandbox.stub(provider, 'getScope').returns('workspace');
      let fired = false;
      provider.onDidChangeTreeData(() => { fired = true; });
      await provider.applyPreset({ name: 'test', paths: ['sub'] });
      assert.ok(fired);
    });

    test('preset with aliases stores alias in pin and shows alias as label', async () => {
      const realDir = path.join(tmpDir, 'sub');
      fs.mkdirSync(realDir);
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sandbox.stub(provider as any, 'getWorkspaceRoot').returns(tmpDir);
      sandbox.stub(provider, 'getScope').returns('workspace');
      await provider.applyPreset({ name: 'test', paths: [{ path: 'sub', alias: 'My Sub' }] });
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: realDir, alias: 'My Sub' }]);
      const items = await provider.getChildren(undefined);
      assert.strictEqual((items[0] as PinnedItemRoot).label, 'My Sub');
    });
  });

  // ── scope-aware storage ────────────────────────────────────────────────────

  suite('scope-aware storage', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('addItem persists to workspaceState when scope is workspace', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      sandbox.stub(provider, 'getScope').returns('workspace');
      sandbox.stub(vscode.window, 'showOpenDialog').resolves([vscode.Uri.file(filePath)]);
      await provider.addItem();
      assert.deepStrictEqual(ctx.workspaceState.get<Pin[]>(STATE_KEY, []), [{ path: filePath }]);
      assert.deepStrictEqual(ctx.globalState.get<Pin[]>(STATE_KEY, []), []);
    });
  });

  // ── onScopeChanged ─────────────────────────────────────────────────────────

  suite('onScopeChanged', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('reloads paths from workspaceState when scope switches to workspace', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      // Start from global scope (no items there) to verify the switch
      const scopeStub = sandbox.stub(provider, 'getScope').returns('global');
      provider.onScopeChanged();
      const before = await provider.getChildren(undefined);
      assert.strictEqual(before.length, 0);
      // Switch to workspace — items should appear
      scopeStub.returns('workspace');
      provider.onScopeChanged();
      const after = await provider.getChildren(undefined);
      assert.strictEqual(after.length, 1);
      assert.strictEqual((after[0] as PinnedItemRoot).itemPath, dirA);
    });

    test('fires onDidChangeTreeData', () => {
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      let fired = false;
      provider.onDidChangeTreeData(() => { fired = true; });
      provider.onScopeChanged();
      assert.ok(fired);
    });

    test('aliases reload from new scope', async () => {
      const dirA = path.join(tmpDir, 'a');
      const dirB = path.join(tmpDir, 'b');
      fs.mkdirSync(dirA);
      fs.mkdirSync(dirB);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirB, alias: 'My Dir' }]);
      await ctx.globalState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      // default scope is workspace — shows dirB with its alias
      const scopeStub = sandbox.stub(provider, 'getScope').returns('workspace');
      provider.onScopeChanged();
      const wsItems = await provider.getChildren(undefined);
      assert.strictEqual((wsItems[0] as PinnedItemRoot).label, 'My Dir');
      // switch to global — shows dirA with basename
      scopeStub.returns('global');
      provider.onScopeChanged();
      const globalItems = await provider.getChildren(undefined);
      assert.strictEqual((globalItems[0] as PinnedItemRoot).label, 'a');
    });
  });

  // ── persistence across provider instances ─────────────────────────────────

  suite('persistence across provider instances', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('new provider reads paths saved by a previous instance', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      const provider1 = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showOpenDialog').resolves([vscode.Uri.file(dirA)]);
      await provider1.addItem();
      const provider2 = new PinboardProvider(ctx);
      const items = await provider2.getChildren(undefined);
      assert.strictEqual(items.length, 1);
      assert.strictEqual((items[0] as PinnedItemRoot).itemPath, dirA);
    });
  });

  // ── rename (FileSystemItem) ────────────────────────────────────────────────

  suite('rename (FileSystemItem)', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('renames file on disk', async () => {
      const oldPath = path.join(tmpDir, 'old.txt');
      fs.writeFileSync(oldPath, '');
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      const item = new FileSystemItem(oldPath, false);
      sandbox.stub(vscode.window, 'showInputBox').resolves('new.txt');
      await provider.rename(item);
      assert.ok(fs.existsSync(path.join(tmpDir, 'new.txt')));
      assert.ok(!fs.existsSync(oldPath));
    });

    test('no-op when input box is cancelled', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      const item = new FileSystemItem(filePath, false);
      sandbox.stub(vscode.window, 'showInputBox').resolves(undefined);
      await provider.rename(item);
      assert.ok(fs.existsSync(filePath));
    });

    test('no-op when new name equals old name', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      const item = new FileSystemItem(filePath, false);
      sandbox.stub(vscode.window, 'showInputBox').resolves('file.txt');
      await provider.rename(item);
      assert.ok(fs.existsSync(filePath));
    });
  });

  // ── deleteItem (FileSystemItem) ────────────────────────────────────────────

  suite('deleteItem (FileSystemItem)', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('deletes file on disk after confirmation', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      const item = new FileSystemItem(filePath, false);
      (sandbox.stub(vscode.window, 'showWarningMessage') as sinon.SinonStub).resolves('Move to Trash');
      await provider.deleteItem(item);
      assert.ok(!fs.existsSync(filePath));
    });

    test('no-op when modal is dismissed', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      const item = new FileSystemItem(filePath, false);
      (sandbox.stub(vscode.window, 'showWarningMessage') as sinon.SinonStub).resolves(undefined);
      await provider.deleteItem(item);
      assert.ok(fs.existsSync(filePath));
    });
  });

  // ── setAlias ───────────────────────────────────────────────────────────────

  suite('setAlias', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('sets alias and getChildren returns item with alias as label', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      sandbox.stub(vscode.window, 'showInputBox').resolves('My Alias');
      await provider.setAlias(roots[0] as PinnedItemRoot);
      const after = await provider.getChildren(undefined);
      assert.strictEqual((after[0] as PinnedItemRoot).label, 'My Alias');
    });

    test('clears alias with empty input and label reverts to basename', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA, alias: 'My Alias' }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      sandbox.stub(vscode.window, 'showInputBox').resolves('');
      await provider.setAlias(roots[0] as PinnedItemRoot);
      const after = await provider.getChildren(undefined);
      assert.strictEqual((after[0] as PinnedItemRoot).label, 'a');
    });

    test('escape (undefined result) makes no change', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA, alias: 'Keep Me' }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      sandbox.stub(vscode.window, 'showInputBox').resolves(undefined);
      await provider.setAlias(roots[0] as PinnedItemRoot);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: dirA, alias: 'Keep Me' }]);
    });

    test('alias persists in storage', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      sandbox.stub(vscode.window, 'showInputBox').resolves('Stored Alias');
      await provider.setAlias(roots[0] as PinnedItemRoot);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: dirA, alias: 'Stored Alias' }]);
    });

    test('alias removal persists in storage (no alias field)', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA, alias: 'Remove Me' }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      sandbox.stub(vscode.window, 'showInputBox').resolves('');
      await provider.setAlias(roots[0] as PinnedItemRoot);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: dirA }]);
    });

    test('item contextValue ends with Aliased after alias is set', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA, alias: 'X' }]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.ok((items[0] as PinnedItemRoot).contextValue?.endsWith('Aliased'));
    });

    test('item contextValue does NOT end with Aliased when no alias', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.ok(!(items[0] as PinnedItemRoot).contextValue?.endsWith('Aliased'));
    });

    test('alias stored in workspaceState when scope is workspace', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      sandbox.stub(provider, 'getScope').returns('workspace');
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      provider.onScopeChanged();
      const roots = await provider.getChildren(undefined);
      sandbox.stub(vscode.window, 'showInputBox').resolves('WS Alias');
      await provider.setAlias(roots[0] as PinnedItemRoot);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: dirA, alias: 'WS Alias' }]);
    });
  });

  // ── removeAlias ────────────────────────────────────────────────────────────

  suite('removeAlias', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('removes alias from storage and reverts label to basename', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA, alias: 'My Alias' }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      await provider.removeAlias(roots[0] as PinnedItemRoot);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: dirA }]);
      const after = await provider.getChildren(undefined);
      assert.strictEqual((after[0] as PinnedItemRoot).label, 'a');
      assert.ok(!(after[0] as PinnedItemRoot).contextValue?.endsWith('Aliased'));
    });

    test('no-op when item has no alias', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      await provider.removeAlias(roots[0] as PinnedItemRoot);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: dirA }]);
    });
  });

  // ── getLabelForPath (via getChildren) ──────────────────────────────────────

  suite('getLabelForPath (via getChildren)', () => {
    let tmpDir: string;
    const wsDirs: string[] = [];

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => {
      removeTempDir(tmpDir);
      for (const d of wsDirs.splice(0)) {
        if (fs.existsSync(d)) { fs.rmdirSync(d); }
      }
    });

    test('default "name" style returns basename', async () => {
      const dirA = path.join(tmpDir, 'mydir');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.strictEqual((items[0] as PinnedItemRoot).label, 'mydir');
    });

    test('"relativePath" style inside workspace returns relative path', async () => {
      const wsFolderPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsFolderPath) { return; }
      const subDir = path.join(wsFolderPath, 'sub');
      if (!fs.existsSync(subDir)) { fs.mkdirSync(subDir); }
      wsDirs.push(subDir);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: subDir }]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => key === 'labelStyle' ? 'relativePath' : defaultVal,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const items = await provider.getChildren(undefined);
      assert.strictEqual((items[0] as PinnedItemRoot).label, 'sub');
    });

    test('"relativePath" style outside workspace falls back to basename', async () => {
      const dirA = path.join(tmpDir, 'outside');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => key === 'labelStyle' ? 'relativePath' : defaultVal,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const items = await provider.getChildren(undefined);
      assert.strictEqual((items[0] as PinnedItemRoot).label, 'outside');
    });

    test('alias overrides "relativePath" style', async () => {
      const wsFolderPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsFolderPath) { return; }
      const subDir = path.join(wsFolderPath, 'sub2');
      if (!fs.existsSync(subDir)) { fs.mkdirSync(subDir); }
      wsDirs.push(subDir);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: subDir, alias: 'Overridden' }]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => key === 'labelStyle' ? 'relativePath' : defaultVal,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const items = await provider.getChildren(undefined);
      assert.strictEqual((items[0] as PinnedItemRoot).label, 'Overridden');
    });

    test('"relativePath" style on workspace-root item shows basename not empty string', async () => {
      const wsFolderPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsFolderPath) { return; }
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: wsFolderPath }]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => key === 'labelStyle' ? 'relativePath' : defaultVal,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const items = await provider.getChildren(undefined);
      const label = (items[0] as PinnedItemRoot).label as string;
      assert.ok(label.length > 0, 'label should not be empty');
      assert.strictEqual(label, path.basename(wsFolderPath));
    });

    test('removing alias with relativePath style shows relative path', async () => {
      const wsFolderPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsFolderPath) { return; }
      const subDir = path.join(wsFolderPath, 'sub3');
      if (!fs.existsSync(subDir)) { fs.mkdirSync(subDir); }
      wsDirs.push(subDir);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: subDir, alias: 'Temp Alias' }]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => key === 'labelStyle' ? 'relativePath' : defaultVal,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const roots = await provider.getChildren(undefined);
      await provider.removeAlias(roots[0] as PinnedItemRoot);
      const after = await provider.getChildren(undefined);
      assert.strictEqual((after[0] as PinnedItemRoot).label, 'sub3');
    });
  });

  // ── alias preservation through operations ──────────────────────────────────

  suite('alias preservation through operations', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('whitespace-only input removes alias', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA, alias: 'Old Alias' }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      sandbox.stub(vscode.window, 'showInputBox').resolves('   ');
      await provider.setAlias(roots[0] as PinnedItemRoot);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: dirA }]);
      const after = await provider.getChildren(undefined);
      assert.strictEqual((after[0] as PinnedItemRoot).label, 'a');
    });

    test('same-value input is a no-op (no storage write)', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA, alias: 'Same' }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      sandbox.stub(vscode.window, 'showInputBox').resolves('Same');
      let persistCalled = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sandbox.stub(provider as any, 'persist').callsFake(async () => { persistCalled = true; });
      await provider.setAlias(roots[0] as PinnedItemRoot);
      assert.strictEqual(persistCalled, false);
    });

    test('alias survives moveUp', async () => {
      const [a, b] = ['a', 'b'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: a }, { path: b, alias: 'B Alias' }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      await provider.moveItemUp(roots[1] as PinnedItemRoot);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: b, alias: 'B Alias' }, { path: a }]);
      const after = await provider.getChildren(undefined);
      assert.strictEqual((after[0] as PinnedItemRoot).label, 'B Alias');
    });

    test('alias survives moveDown', async () => {
      const [a, b] = ['a', 'b'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: a, alias: 'A Alias' }, { path: b }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      await provider.moveItemDown(roots[0] as PinnedItemRoot);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: b }, { path: a, alias: 'A Alias' }]);
      const after = await provider.getChildren(undefined);
      assert.strictEqual((after[1] as PinnedItemRoot).label, 'A Alias');
    });

    test('alias survives handleDrop reorder', async () => {
      const [a, b, c] = ['a', 'b', 'c'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: a }, { path: b, alias: 'B Alias' }, { path: c }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      provider.handleDrag([roots[1] as PinnedItemRoot], dt); // drag B
      await provider.handleDrop(roots[2] as PinnedItemRoot, dt); // drop onto C → order: a, b, c → a, c... no: insert before C
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      // B is dropped before C → new order: A, B, C (B was between A and C; now B is inserted before C from remaining [A,C])
      // remaining after removing B: [A, C]; insert B before C at index 1 → [A, B, C]
      assert.deepStrictEqual(stored, [{ path: a }, { path: b, alias: 'B Alias' }, { path: c }]);
    });

    test('pinned file can have alias', async () => {
      const filePath = path.join(tmpDir, 'readme.md');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: filePath, alias: 'Docs' }]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.strictEqual((items[0] as PinnedItemRoot).label, 'Docs');
      assert.ok((items[0] as PinnedItemRoot).contextValue?.endsWith('Aliased'));
    });

    test('multiple items with mixed aliases display correctly', async () => {
      const [a, b, c] = ['a', 'b', 'c'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [
        { path: a, alias: 'First' },
        { path: b },
        { path: c, alias: 'Third' },
      ]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.strictEqual((items[0] as PinnedItemRoot).label, 'First');
      assert.strictEqual((items[1] as PinnedItemRoot).label, 'b');
      assert.strictEqual((items[2] as PinnedItemRoot).label, 'Third');
      assert.ok((items[0] as PinnedItemRoot).contextValue?.endsWith('Aliased'));
      assert.ok(!(items[1] as PinnedItemRoot).contextValue?.endsWith('Aliased'));
      assert.ok((items[2] as PinnedItemRoot).contextValue?.endsWith('Aliased'));
    });

    test('alias preserved through renamePinnedItem', async () => {
      const oldDir = path.join(tmpDir, 'old');
      const newDir = path.join(tmpDir, 'new');
      fs.mkdirSync(oldDir);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: oldDir, alias: 'Kept Alias' }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      sandbox.stub(vscode.window, 'showInputBox').resolves('new');
      await provider.renamePinnedItem(roots[0] as PinnedItemRoot);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.ok(fs.existsSync(newDir));
      assert.deepStrictEqual(stored, [{ path: newDir, alias: 'Kept Alias' }]);
    });
  });

  // ── scope isolation ────────────────────────────────────────────────────────

  suite('scope isolation', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('global pins are not visible when scope is workspace', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(provider, 'getScope').returns('workspace');
      provider.onScopeChanged();
      const items = await provider.getChildren(undefined);
      assert.strictEqual(items.length, 0);
    });

    test('workspace pins are not visible when scope is global', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(provider, 'getScope').returns('global');
      provider.onScopeChanged();
      const items = await provider.getChildren(undefined);
      assert.strictEqual(items.length, 0);
    });

    test('same path can have different alias per scope', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA, alias: 'Workspace Label' }]);
      await ctx.globalState.update(STATE_KEY, [{ path: dirA, alias: 'Global Label' }]);
      const provider = new PinboardProvider(ctx);
      // default scope is workspace — shows workspace alias
      const wsItems = await provider.getChildren(undefined);
      assert.strictEqual((wsItems[0] as PinnedItemRoot).label, 'Workspace Label');
      // switch to global — shows global alias
      sandbox.stub(provider, 'getScope').returns('global');
      provider.onScopeChanged();
      const globalItems = await provider.getChildren(undefined);
      assert.strictEqual((globalItems[0] as PinnedItemRoot).label, 'Global Label');
    });

    test('removeAlias in workspace scope writes to workspaceState not globalState', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA, alias: 'WS Alias' }]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(provider, 'getScope').returns('workspace');
      provider.onScopeChanged();
      const roots = await provider.getChildren(undefined);
      await provider.removeAlias(roots[0] as PinnedItemRoot);
      assert.deepStrictEqual(ctx.workspaceState.get<Pin[]>(STATE_KEY, []), [{ path: dirA }]);
      assert.deepStrictEqual(ctx.globalState.get<Pin[]>(STATE_KEY, []), []);
    });
  });

  // ── applyPreset additional alias tests ─────────────────────────────────────

  suite('applyPreset (alias edge cases)', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('preset replaces existing aliased pins', async () => {
      const oldDir = path.join(tmpDir, 'old');
      const newDir = path.join(tmpDir, 'new');
      fs.mkdirSync(oldDir);
      fs.mkdirSync(newDir);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: oldDir, alias: 'Old Alias' }]);
      const provider = new PinboardProvider(ctx);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sandbox.stub(provider as any, 'getWorkspaceRoot').returns(tmpDir);
      sandbox.stub(provider, 'getScope').returns('workspace');
      provider.onScopeChanged();
      await provider.applyPreset({ name: 'test', paths: ['new'] });
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: newDir }]);
    });

    test('plain-string preset entry produces pin with no alias field', async () => {
      const subDir = path.join(tmpDir, 'sub');
      fs.mkdirSync(subDir);
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sandbox.stub(provider as any, 'getWorkspaceRoot').returns(tmpDir);
      sandbox.stub(provider, 'getScope').returns('workspace');
      await provider.applyPreset({ name: 'test', paths: ['sub'] });
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: subDir }]);
      assert.strictEqual('alias' in stored[0], false);
    });
  });

  // ── deletePinnedItem with alias ────────────────────────────────────────────

  suite('deletePinnedItem (with alias)', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('deleting aliased item removes both path and alias from storage', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA, alias: 'My Alias' }]);
      const provider = new PinboardProvider(ctx);
      (sandbox.stub(vscode.window, 'showWarningMessage') as sinon.SinonStub).resolves('Move to Trash');
      const roots = await provider.getChildren(undefined);
      await provider.deletePinnedItem(roots[0] as PinnedItemRoot);
      const stored = ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, []);
    });
  });

  // ── tree item ids ─────────────────────────────────────────────────────────

  suite('tree item ids', () => {
    test('PinnedItemRoot has id equal to itemPath', () => {
      const itemPath = '/tmp/test-path';
      const item = new PinnedItemRoot(itemPath, true, false, 'single', 'test', false);
      assert.strictEqual(item.id, itemPath);
    });

    test('FileSystemItem has id equal to itemPath', () => {
      const itemPath = '/tmp/test-path/file.txt';
      const item = new FileSystemItem(itemPath, false);
      assert.strictEqual(item.id, itemPath);
    });
  });

  // ── getParent ─────────────────────────────────────────────────────────────

  suite('getParent', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('returns undefined for root items', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      const parent = provider.getParent(roots[0]);
      assert.strictEqual(parent, undefined);
    });

    test('returns PinnedItemRoot for direct child of a pinned folder', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      fs.writeFileSync(path.join(dirA, 'foo.txt'), '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      await provider.getChildren(undefined);
      const child = new FileSystemItem(path.join(dirA, 'foo.txt'), false);
      const parent = provider.getParent(child) as PinnedItemRoot;
      assert.ok(parent);
      assert.strictEqual(parent.kind, 'root');
      assert.strictEqual(parent.itemPath, dirA);
    });

    test('returns FileSystemItem for deeply nested item', async () => {
      const dirA = path.join(tmpDir, 'a');
      const sub = path.join(dirA, 'sub');
      fs.mkdirSync(sub, { recursive: true });
      fs.writeFileSync(path.join(sub, 'deep.txt'), '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      await provider.getChildren(undefined);
      const deepItem = new FileSystemItem(path.join(sub, 'deep.txt'), false);
      const parent = provider.getParent(deepItem) as FileSystemItem;
      assert.ok(parent);
      assert.strictEqual(parent.kind, 'fsitem');
      assert.strictEqual(parent.itemPath, sub);
      assert.strictEqual(parent.isDirectory, true);
    });

    test('returned parent has matching id', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      fs.writeFileSync(path.join(dirA, 'foo.txt'), '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      const child = new FileSystemItem(path.join(dirA, 'foo.txt'), false);
      const parent = provider.getParent(child) as PinnedItemRoot;
      assert.strictEqual(parent.id, roots[0].id);
    });
  });

  // ── revealActiveFile ──────────────────────────────────────────────────────

  suite('revealActiveFile', () => {
    let tmpDir: string;

    function createMockTreeView(visible = true) {
      return {
        visible,
        reveal: sandbox.stub().resolves(),
        onDidExpandElement: () => ({ dispose() {} }),
        onDidCollapseElement: () => ({ dispose() {} }),
        onDidChangeSelection: () => ({ dispose() {} }),
        onDidChangeVisibility: () => ({ dispose() {} }),
        onDidChangeCheckboxState: () => ({ dispose() {} }),
      } as unknown as vscode.TreeView<PinnedItemRoot | FileSystemItem>;
    }

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('reveals a file nested inside a pinned directory', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      fs.writeFileSync(path.join(dirA, 'foo.txt'), '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      await provider.getChildren(undefined);
      const tv = createMockTreeView();
      provider.revealActiveFile(tv, path.join(dirA, 'foo.txt'));
      assert.ok((tv.reveal as sinon.SinonStub).calledOnce);
      const revealed = (tv.reveal as sinon.SinonStub).firstCall.args[0];
      assert.strictEqual(revealed.id, path.join(dirA, 'foo.txt'));
    });

    test('reveals a deeply nested file (2+ levels deep)', async () => {
      const dirA = path.join(tmpDir, 'a');
      const sub = path.join(dirA, 'sub');
      fs.mkdirSync(sub, { recursive: true });
      fs.writeFileSync(path.join(sub, 'deep.txt'), '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      await provider.getChildren(undefined);
      const tv = createMockTreeView();
      provider.revealActiveFile(tv, path.join(sub, 'deep.txt'));
      assert.ok((tv.reveal as sinon.SinonStub).calledOnce);
      const revealed = (tv.reveal as sinon.SinonStub).firstCall.args[0];
      assert.strictEqual(revealed.id, path.join(sub, 'deep.txt'));
    });

    test('reveals a pinned root file', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: filePath }]);
      const provider = new PinboardProvider(ctx);
      await provider.getChildren(undefined);
      const tv = createMockTreeView();
      provider.revealActiveFile(tv, filePath);
      assert.ok((tv.reveal as sinon.SinonStub).calledOnce);
      const revealed = (tv.reveal as sinon.SinonStub).firstCall.args[0];
      assert.strictEqual(revealed.kind, 'root');
      assert.strictEqual(revealed.id, filePath);
    });

    test('does NOT reveal a pinned directory as a root', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      await provider.getChildren(undefined);
      const tv = createMockTreeView();
      provider.revealActiveFile(tv, dirA);
      assert.ok((tv.reveal as sinon.SinonStub).notCalled);
    });

    test('no-op when file is not under any pin', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      await provider.getChildren(undefined);
      const tv = createMockTreeView();
      provider.revealActiveFile(tv, path.join(tmpDir, 'b', 'foo.txt'));
      assert.ok((tv.reveal as sinon.SinonStub).notCalled);
    });

    test('no-op when treeView is not visible', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      fs.writeFileSync(path.join(dirA, 'foo.txt'), '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      await provider.getChildren(undefined);
      const tv = createMockTreeView(false);
      provider.revealActiveFile(tv, path.join(dirA, 'foo.txt'));
      assert.ok((tv.reveal as sinon.SinonStub).notCalled);
    });

    test('picks the most specific pin when pins overlap', async () => {
      const dirA = path.join(tmpDir, 'a');
      const sub = path.join(dirA, 'sub');
      fs.mkdirSync(sub, { recursive: true });
      fs.writeFileSync(path.join(sub, 'foo.txt'), '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }, { path: sub }]);
      const provider = new PinboardProvider(ctx);
      await provider.getChildren(undefined);
      const tv = createMockTreeView();
      provider.revealActiveFile(tv, path.join(sub, 'foo.txt'));
      assert.ok((tv.reveal as sinon.SinonStub).calledOnce);
      const revealed = (tv.reveal as sinon.SinonStub).firstCall.args[0];
      assert.strictEqual(revealed.id, path.join(sub, 'foo.txt'));
    });

    test('no false positive on path prefix', async () => {
      const pin = path.join(tmpDir, 'pin');
      const pinboard = path.join(tmpDir, 'pinboard');
      fs.mkdirSync(pin);
      fs.mkdirSync(pinboard);
      fs.writeFileSync(path.join(pinboard, 'foo.txt'), '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: pin }]);
      const provider = new PinboardProvider(ctx);
      await provider.getChildren(undefined);
      const tv = createMockTreeView();
      provider.revealActiveFile(tv, path.join(pinboard, 'foo.txt'));
      assert.ok((tv.reveal as sinon.SinonStub).notCalled);
    });

    test('works with multiple pins, only matches correct one', async () => {
      const dirA = path.join(tmpDir, 'a');
      const dirB = path.join(tmpDir, 'b');
      fs.mkdirSync(dirA);
      fs.mkdirSync(dirB);
      fs.writeFileSync(path.join(dirB, 'foo.txt'), '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }, { path: dirB }]);
      const provider = new PinboardProvider(ctx);
      await provider.getChildren(undefined);
      const tv = createMockTreeView();
      provider.revealActiveFile(tv, path.join(dirB, 'foo.txt'));
      assert.ok((tv.reveal as sinon.SinonStub).calledOnce);
      const revealed = (tv.reveal as sinon.SinonStub).firstCall.args[0];
      assert.strictEqual(revealed.id, path.join(dirB, 'foo.txt'));
    });

    test('fires tree data change when switching to non-pinned file after a reveal', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      fs.writeFileSync(path.join(dirA, 'foo.txt'), '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      await provider.getChildren(undefined);
      const tv = createMockTreeView();
      provider.revealActiveFile(tv, path.join(dirA, 'foo.txt'));

      let changeCount = 0;
      provider.onDidChangeTreeData(() => { changeCount++; });
      provider.revealActiveFile(tv, path.join(tmpDir, 'other', 'bar.txt'));
      assert.ok(changeCount >= 1);
    });

    test('does not fire tree data change when no match and no previous reveal', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      await provider.getChildren(undefined);
      const tv = createMockTreeView();

      let changeCount = 0;
      provider.onDidChangeTreeData(() => { changeCount++; });
      provider.revealActiveFile(tv, path.join(tmpDir, 'other', 'bar.txt'));
      assert.strictEqual(changeCount, 0);
    });

    test('getTreeItem mangles id of stale item during selection clearing', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      fs.writeFileSync(path.join(dirA, 'foo.txt'), '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      await provider.getChildren(undefined);
      const tv = createMockTreeView();

      provider.revealActiveFile(tv, path.join(dirA, 'foo.txt'));
      provider.revealActiveFile(tv, path.join(tmpDir, 'other', 'bar.txt'));

      const staleItem = new FileSystemItem(path.join(dirA, 'foo.txt'), false);
      const result = provider.getTreeItem(staleItem);
      assert.notStrictEqual(result.id, path.join(dirA, 'foo.txt'));
    });

    test('dirPins populated from rebuildWatchers without needing getChildren', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      fs.writeFileSync(path.join(dirA, 'foo.txt'), '');
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      // Do NOT call getChildren — _dirPins should already be populated by rebuildWatchers
      const tv = createMockTreeView();
      provider.revealActiveFile(tv, path.join(dirA, 'foo.txt'));
      assert.ok((tv.reveal as sinon.SinonStub).calledOnce);
    });
  });

  // ── pinToGlobal / pinToWorkspace ───────────────────────────────────────────

  suite('pinToGlobal / pinToWorkspace', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    test('pins to globalState regardless of current scope (workspace active)', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      sandbox.stub(provider, 'getScope').returns('workspace');
      await provider.pinToGlobal(vscode.Uri.file(filePath));
      assert.deepStrictEqual(ctx.globalState.get<Pin[]>(STATE_KEY, []), [{ path: filePath }]);
      assert.deepStrictEqual(ctx.workspaceState.get<Pin[]>(STATE_KEY, []), []);
    });

    test('pins to workspaceState regardless of current scope (global active)', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      sandbox.stub(provider, 'getScope').returns('global');
      await provider.pinToWorkspace(vscode.Uri.file(filePath));
      assert.deepStrictEqual(ctx.workspaceState.get<Pin[]>(STATE_KEY, []), [{ path: filePath }]);
      assert.deepStrictEqual(ctx.globalState.get<Pin[]>(STATE_KEY, []), []);
    });

    test('refreshes tree when pinning to current scope', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      sandbox.stub(provider, 'getScope').returns('workspace');
      let fired = false;
      provider.onDidChangeTreeData(() => { fired = true; });
      await provider.pinToWorkspace(vscode.Uri.file(filePath));
      assert.ok(fired);
      const items = await provider.getChildren(undefined);
      assert.strictEqual(items.length, 1);
    });

    test('does not refresh tree when pinning to other scope', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      sandbox.stub(provider, 'getScope').returns('workspace');
      let fired = false;
      provider.onDidChangeTreeData(() => { fired = true; });
      await provider.pinToGlobal(vscode.Uri.file(filePath));
      assert.strictEqual(fired, false);
      const items = await provider.getChildren(undefined);
      assert.strictEqual(items.length, 0);
    });

    test('prevents duplicates', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      const uri = vscode.Uri.file(filePath);
      await provider.pinToGlobal(uri);
      await provider.pinToGlobal(uri);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
      assert.strictEqual(stored.length, 1);
    });

    test('falls back to file picker when no URI', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      const showOpenDialog = sandbox.stub(vscode.window, 'showOpenDialog').resolves([vscode.Uri.file(filePath)]);
      await provider.pinToGlobal(undefined);
      assert.ok(showOpenDialog.calledOnce);
      assert.deepStrictEqual(ctx.globalState.get<Pin[]>(STATE_KEY, []), [{ path: filePath }]);
    });
  });

  // ── sortPins ───────────────────────────────────────────────────────────────

  suite('sortPins', () => {
    let tmpDir: string;
    let a: string, b: string, c: string;

    setup(() => {
      tmpDir = makeTempDir();
      [a, b, c] = ['apple', 'Banana', 'cherry'].map(n => {
        const p = path.join(tmpDir, n);
        fs.mkdirSync(p);
        return p;
      });
    });
    teardown(() => { removeTempDir(tmpDir); });

    function stubSort(mode: 'manual' | 'alias'): void {
      sandbox.stub(vscode.workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => key === 'sortPins' ? mode : defaultVal,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }

    async function makeProvider(pins: Pin[]) {
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, pins);
      return { ctx, provider: new PinboardProvider(ctx) };
    }

    async function rootPaths(provider: PinboardProvider): Promise<string[]> {
      return (await provider.getChildren(undefined)).map(i => (i as PinnedItemRoot).itemPath);
    }

    test('manual keeps stored order', async () => {
      stubSort('manual');
      const { provider } = await makeProvider([{ path: c }, { path: a }, { path: b }]);
      assert.deepStrictEqual(await rootPaths(provider), [c, a, b]);
    });

    test('alias sorts case-insensitively, falling back to name', async () => {
      stubSort('alias');
      const { provider } = await makeProvider([
        { path: c },
        { path: a, alias: '[ui] App' },
        { path: b, alias: '[api] Server' },
      ]);
      assert.deepStrictEqual(await rootPaths(provider), [b, a, c]);
    });

    test('sorting does not change stored order', async () => {
      stubSort('alias');
      const { ctx, provider } = await makeProvider([{ path: c }, { path: a }, { path: b }]);
      await provider.getChildren(undefined);
      assert.deepStrictEqual(
        ctx.workspaceState.get<Pin[]>(STATE_KEY, []).map(p => p.path),
        [c, a, b]
      );
    });

    test('position contextValues follow sorted order', async () => {
      stubSort('alias');
      const { provider } = await makeProvider([{ path: c }, { path: a }, { path: b }]);
      const items = await provider.getChildren(undefined);
      assert.deepStrictEqual(
        items.map(i => i.contextValue),
        ['pinnedFolderFirst', 'pinnedFolderMiddle', 'pinnedFolderLast']
      );
    });

    test('moveItemUp and moveItemDown are no-ops while sorted', async () => {
      stubSort('alias');
      const { ctx, provider } = await makeProvider([{ path: c }, { path: a }, { path: b }]);
      const items = await provider.getChildren(undefined);
      await provider.moveItemUp(items[1] as PinnedItemRoot);
      await provider.moveItemDown(items[0] as PinnedItemRoot);
      assert.deepStrictEqual(
        ctx.workspaceState.get<Pin[]>(STATE_KEY, []).map(p => p.path),
        [c, a, b]
      );
    });

    test('drag and drop is a no-op while sorted', async () => {
      stubSort('alias');
      const { ctx, provider } = await makeProvider([{ path: c }, { path: a }, { path: b }]);
      const items = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      provider.handleDrag([items[0] as PinnedItemRoot], dt);
      assert.strictEqual(dt.get('application/vscode.tree.pinboard'), undefined);
      dt.set('application/vscode.tree.pinboard', new vscode.DataTransferItem([c]));
      await provider.handleDrop(items[2] as PinnedItemRoot, dt);
      assert.deepStrictEqual(
        ctx.workspaceState.get<Pin[]>(STATE_KEY, []).map(p => p.path),
        [c, a, b]
      );
    });
  });

  // ── moveTo / copyTo / drag items ───────────────────────────────────────────

  suite('moveTo / copyTo / drag items', () => {
    let tmpDir: string;
    let srcDir: string;
    let destDir: string;
    let file: string;

    let trashed: string[];
    setup(() => { trashed = []; });
    function stubTrash(provider: PinboardProvider): PinboardProvider {
      sandbox.stub(provider, 'trashItem').callsFake(async (uri: vscode.Uri) => {
        trashed.push(uri.fsPath);
        fs.rmSync(uri.fsPath, { recursive: true, force: true });
      });
      return provider;
    }

    setup(() => {
      tmpDir = makeTempDir();
      srcDir = path.join(tmpDir, 'src');
      destDir = path.join(tmpDir, 'dest');
      fs.mkdirSync(srcDir);
      fs.mkdirSync(destDir);
      file = path.join(srcDir, 'a.txt');
      fs.writeFileSync(file, 'hello');
    });
    teardown(() => { removeTempDir(tmpDir); });

    async function makeProvider(pins: Pin[]) {
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, pins);
      return { ctx, provider: stubTrash(new PinboardProvider(ctx)) };
    }

    function pickFolder(folder: string | undefined) {
      return sandbox.stub(vscode.window, 'showOpenDialog').resolves(
        folder ? [vscode.Uri.file(folder)] : undefined
      );
    }

    function storedPaths(ctx: vscode.ExtensionContext): string[] {
      return ctx.workspaceState.get<Pin[]>(STATE_KEY, []).map(p => p.path);
    }

    test('moveTo moves a nested file into the picked folder', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      await provider.moveTo(new FileSystemItem(file, false));
      assert.ok(!fs.existsSync(file));
      assert.strictEqual(fs.readFileSync(path.join(destDir, 'a.txt'), 'utf8'), 'hello');
    });

    test('copyTo copies and keeps the source', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      await provider.copyTo(new FileSystemItem(file, false));
      assert.ok(fs.existsSync(file));
      assert.strictEqual(fs.readFileSync(path.join(destDir, 'a.txt'), 'utf8'), 'hello');
    });

    test('copyTo copies a folder recursively', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      await provider.copyTo(new PinnedItemRoot(srcDir, true, false, 'single', 'src', false));
      assert.ok(fs.existsSync(path.join(destDir, 'src', 'a.txt')));
      assert.ok(fs.existsSync(file));
    });

    test('moveTo on a pinned root updates the stored pin path', async () => {
      const { ctx, provider } = await makeProvider([{ path: srcDir, alias: 'Src' }]);
      pickFolder(destDir);
      await provider.moveTo(new PinnedItemRoot(srcDir, true, false, 'single', 'Src', true));
      const moved = path.join(destDir, 'src');
      assert.deepStrictEqual(ctx.workspaceState.get<Pin[]>(STATE_KEY, []), [{ path: moved, alias: 'Src' }]);
    });

    test('moving a folder updates pins nested inside it', async () => {
      const { ctx, provider } = await makeProvider([{ path: file }]);
      pickFolder(destDir);
      await provider.moveTo(new FileSystemItem(srcDir, true));
      assert.deepStrictEqual(storedPaths(ctx), [path.join(destDir, 'src', 'a.txt')]);
    });

    test('copyTo does not change stored pins', async () => {
      const { ctx, provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      await provider.copyTo(new PinnedItemRoot(srcDir, true, false, 'single', 'src', false));
      assert.deepStrictEqual(storedPaths(ctx), [srcDir]);
    });

    test('cancelled folder picker does nothing', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(undefined);
      await provider.moveTo(new FileSystemItem(file, false));
      assert.ok(fs.existsSync(file));
    });

    test('name collision asks before replacing; cancel keeps both files', async () => {
      fs.writeFileSync(path.join(destDir, 'a.txt'), 'existing');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      const warn = sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
      await provider.moveTo(new FileSystemItem(file, false));
      assert.ok(warn.calledOnce);
      assert.ok(fs.existsSync(file));
      assert.strictEqual(fs.readFileSync(path.join(destDir, 'a.txt'), 'utf8'), 'existing');
    });

    test('name collision overwrites when Replace is chosen', async () => {
      fs.writeFileSync(path.join(destDir, 'a.txt'), 'existing');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      await provider.moveTo(new FileSystemItem(file, false));
      assert.ok(!fs.existsSync(file));
      assert.strictEqual(fs.readFileSync(path.join(destDir, 'a.txt'), 'utf8'), 'hello');
    });

    test('refuses to move a folder into itself', async () => {
      const inner = path.join(srcDir, 'inner');
      fs.mkdirSync(inner);
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(inner);
      const err = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      await provider.moveTo(new FileSystemItem(srcDir, true));
      assert.ok(err.calledOnce);
      assert.ok(fs.existsSync(file));
    });

    test('copying an item into its own folder is a no-op', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(srcDir);
      sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
      await provider.copyTo(new FileSystemItem(file, false));
      assert.strictEqual(fs.readFileSync(file, 'utf8'), 'hello');
      assert.deepStrictEqual(fs.readdirSync(srcDir), ['a.txt']);
    });

    test('moving an item into its own folder is a silent no-op', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(srcDir);
      await provider.moveTo(new FileSystemItem(file, false));
      assert.ok(fs.existsSync(file));
    });

    test('dragging a nested item onto a folder moves it after confirmation', async () => {
      const { provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      provider.handleDrag([new FileSystemItem(file, false)], dt);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.ok(!fs.existsSync(file));
      assert.ok(fs.existsSync(path.join(destDir, 'a.txt')));
    });

    test('dragging declined at the confirmation does nothing', async () => {
      const { provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      provider.handleDrag([new FileSystemItem(file, false)], dt);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.ok(fs.existsSync(file));
    });

    test('dropping onto a file moves into that file\'s parent folder', async () => {
      const sibling = path.join(destDir, 'b.txt');
      fs.writeFileSync(sibling, '');
      const { provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const dt = new vscode.DataTransfer();
      provider.handleDrag([new FileSystemItem(file, false)], dt);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      await provider.handleDrop(new FileSystemItem(sibling, false), dt);
      assert.ok(fs.existsSync(path.join(destDir, 'a.txt')));
    });

    test('dropping onto empty space or a root file does nothing', async () => {
      const rootFile = path.join(tmpDir, 'root.txt');
      fs.writeFileSync(rootFile, '');
      const { provider } = await makeProvider([{ path: srcDir }, { path: rootFile }]);
      const dt = new vscode.DataTransfer();
      provider.handleDrag([new FileSystemItem(file, false)], dt);
      const warn = sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      await provider.handleDrop(undefined, dt);
      await provider.handleDrop(new PinnedItemRoot(rootFile, false, false, 'last', 'root.txt', false), dt);
      assert.ok(warn.notCalled);
      assert.ok(fs.existsSync(file));
    });

    test('dragging a nested item works while sorting is on', async () => {
      const { provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      sandbox.stub(vscode.workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => key === 'sortPins' ? 'alias' : defaultVal,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const dt = new vscode.DataTransfer();
      provider.handleDrag([new FileSystemItem(file, false)], dt);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.ok(fs.existsSync(path.join(destDir, 'a.txt')));
    });

    test('dragging a pinned root still only reorders pins', async () => {
      const { ctx, provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      provider.handleDrag([roots[0] as PinnedItemRoot], dt);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.ok(fs.existsSync(srcDir));
      assert.ok(fs.existsSync(destDir));
      assert.deepStrictEqual(storedPaths(ctx), [srcDir, destDir]);
    });
  });

  // ── transfer edge cases ────────────────────────────────────────────────────

  suite('transfer edge cases', () => {
    let tmpDir: string;
    let srcDir: string;
    let destDir: string;
    let file: string;
    let trashed: string[];
    setup(() => { trashed = []; });
    function stubTrash(provider: PinboardProvider): PinboardProvider {
      sandbox.stub(provider, 'trashItem').callsFake(async (uri: vscode.Uri) => {
        trashed.push(uri.fsPath);
        fs.rmSync(uri.fsPath, { recursive: true, force: true });
      });
      return provider;
    }

    const FS_MIME = 'application/vscode.tree.pinboard.items';

    setup(() => {
      tmpDir = makeTempDir();
      srcDir = path.join(tmpDir, 'src');
      destDir = path.join(tmpDir, 'dest');
      fs.mkdirSync(srcDir);
      fs.mkdirSync(destDir);
      file = path.join(srcDir, 'a.txt');
      fs.writeFileSync(file, 'hello');
    });
    teardown(() => { removeTempDir(tmpDir); });

    async function makeProvider(pins: Pin[]) {
      const ctx = createMockContext();
      await ctx.workspaceState.update(STATE_KEY, pins);
      return { ctx, provider: stubTrash(new PinboardProvider(ctx)) };
    }

    function pickFolder(folder: string) {
      return sandbox.stub(vscode.window, 'showOpenDialog').resolves([vscode.Uri.file(folder)]);
    }

    function stored(ctx: vscode.ExtensionContext): Pin[] {
      return ctx.workspaceState.get<Pin[]>(STATE_KEY, []);
    }

    function dragOf(provider: PinnedItemRoot | PinboardProvider, items: FileSystemItem[]): vscode.DataTransfer {
      const dt = new vscode.DataTransfer();
      (provider as PinboardProvider).handleDrag(items, dt);
      return dt;
    }

    // ── pins follow moves ────────────────────────────────────────────────────

    test('moving a pinned root FILE updates its pin and keeps the alias', async () => {
      const { ctx, provider } = await makeProvider([{ path: file, alias: 'Notes' }]);
      pickFolder(destDir);
      await provider.moveTo(new PinnedItemRoot(file, false, false, 'single', 'Notes', true));
      assert.deepStrictEqual(stored(ctx), [{ path: path.join(destDir, 'a.txt'), alias: 'Notes' }]);
      assert.ok(fs.existsSync(path.join(destDir, 'a.txt')));
    });

    test('pin under a moved folder keeps its alias and relative path', async () => {
      const sub = path.join(srcDir, 'sub');
      fs.mkdirSync(sub);
      const { ctx, provider } = await makeProvider([{ path: sub, alias: 'Sub' }]);
      pickFolder(destDir);
      await provider.moveTo(new FileSystemItem(srcDir, true));
      assert.deepStrictEqual(stored(ctx), [{ path: path.join(destDir, 'src', 'sub'), alias: 'Sub' }]);
    });

    test('a pin whose path merely starts with the moved path is untouched', async () => {
      const lookalike = path.join(tmpDir, 'src-other');
      fs.mkdirSync(lookalike);
      const { ctx, provider } = await makeProvider([{ path: lookalike }]);
      pickFolder(destDir);
      await provider.moveTo(new FileSystemItem(srcDir, true));
      assert.deepStrictEqual(stored(ctx), [{ path: lookalike }]);
    });

    test('unrelated pins and their order are untouched by a move', async () => {
      const other = path.join(tmpDir, 'other');
      fs.mkdirSync(other);
      const { ctx, provider } = await makeProvider([{ path: other }, { path: srcDir }, { path: destDir }]);
      pickFolder(destDir);
      await provider.moveTo(new PinnedItemRoot(srcDir, true, false, 'middle', 'src', false));
      assert.deepStrictEqual(stored(ctx).map(p => p.path), [other, path.join(destDir, 'src'), destDir]);
    });

    test('replacing a pinned target does not leave duplicate pins', async () => {
      const existing = path.join(destDir, 'a.txt');
      fs.writeFileSync(existing, 'old');
      const { ctx, provider } = await makeProvider([{ path: file }, { path: existing }]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      await provider.moveTo(new FileSystemItem(file, false));
      assert.deepStrictEqual(stored(ctx).map(p => p.path), [existing]);
    });

    test('tree shows the moved root at its new path', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      await provider.moveTo(new PinnedItemRoot(srcDir, true, false, 'single', 'src', false));
      const roots = await provider.getChildren(undefined);
      assert.deepStrictEqual(roots.map(r => (r as PinnedItemRoot).itemPath), [path.join(destDir, 'src')]);
    });

    test('a moved item appears under another pinned folder', async () => {
      const { provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      pickFolder(destDir);
      await provider.moveTo(new FileSystemItem(file, false));
      const roots = await provider.getChildren(undefined);
      const kids = await provider.getChildren(roots[1] as PinnedItemRoot);
      assert.deepStrictEqual(kids.map(k => path.basename((k as FileSystemItem).itemPath)), ['a.txt']);
    });

    test('successful transfer fires a tree refresh', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      let fired = 0;
      provider.onDidChangeTreeData(() => { fired++; });
      pickFolder(destDir);
      await provider.copyTo(new FileSystemItem(file, false));
      assert.ok(fired > 0);
    });

    test('cancelled or blocked transfer does not refresh or touch storage', async () => {
      const { ctx, provider } = await makeProvider([{ path: srcDir }]);
      let fired = 0;
      provider.onDidChangeTreeData(() => { fired++; });
      pickFolder(srcDir);
      await provider.moveTo(new FileSystemItem(file, false));
      assert.strictEqual(fired, 0);
      assert.deepStrictEqual(stored(ctx), [{ path: srcDir }]);
    });

    // ── content integrity ────────────────────────────────────────────────────

    test('moving a folder carries all nested content', async () => {
      fs.mkdirSync(path.join(srcDir, 'deep', 'er'), { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'deep', 'er', 'x.txt'), 'nested');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      await provider.moveTo(new FileSystemItem(srcDir, true));
      assert.ok(!fs.existsSync(srcDir));
      assert.strictEqual(fs.readFileSync(path.join(destDir, 'src', 'deep', 'er', 'x.txt'), 'utf8'), 'nested');
      assert.strictEqual(fs.readFileSync(path.join(destDir, 'src', 'a.txt'), 'utf8'), 'hello');
    });

    test('copying a folder leaves the source fully intact', async () => {
      fs.mkdirSync(path.join(srcDir, 'deep'));
      fs.writeFileSync(path.join(srcDir, 'deep', 'x.txt'), 'nested');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      await provider.copyTo(new FileSystemItem(srcDir, true));
      assert.strictEqual(fs.readFileSync(path.join(srcDir, 'deep', 'x.txt'), 'utf8'), 'nested');
      assert.strictEqual(fs.readFileSync(path.join(destDir, 'src', 'deep', 'x.txt'), 'utf8'), 'nested');
    });

    test('names with spaces, parentheses and unicode survive move and copy', async () => {
      const copied = path.join(srcDir, 'my file (1) é 日本.txt');
      const moved = path.join(srcDir, 'other [2] ü.txt');
      fs.writeFileSync(copied, 'copied');
      fs.writeFileSync(moved, 'moved');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      await provider.copyTo(new FileSystemItem(copied, false));
      await provider.moveTo(new FileSystemItem(moved, false));
      assert.ok(fs.existsSync(copied));
      assert.ok(!fs.existsSync(moved));
      assert.strictEqual(fs.readFileSync(path.join(destDir, 'my file (1) é 日本.txt'), 'utf8'), 'copied');
      assert.strictEqual(fs.readFileSync(path.join(destDir, 'other [2] ü.txt'), 'utf8'), 'moved');
    });

    test('an empty folder can be moved', async () => {
      const empty = path.join(srcDir, 'empty');
      fs.mkdirSync(empty);
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      await provider.moveTo(new FileSystemItem(empty, true));
      assert.ok(fs.statSync(path.join(destDir, 'empty')).isDirectory());
      assert.ok(!fs.existsSync(empty));
    });

    // ── collisions ───────────────────────────────────────────────────────────

    test('copy collision: cancel keeps the existing file', async () => {
      fs.writeFileSync(path.join(destDir, 'a.txt'), 'existing');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
      await provider.copyTo(new FileSystemItem(file, false));
      assert.strictEqual(fs.readFileSync(path.join(destDir, 'a.txt'), 'utf8'), 'existing');
    });

    test('copy collision: Replace overwrites and keeps the source', async () => {
      fs.writeFileSync(path.join(destDir, 'a.txt'), 'existing');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      await provider.copyTo(new FileSystemItem(file, false));
      assert.strictEqual(fs.readFileSync(path.join(destDir, 'a.txt'), 'utf8'), 'hello');
      assert.ok(fs.existsSync(file));
    });

    test('folder collision on move: Replace swaps the whole folder', async () => {
      const clash = path.join(destDir, 'src');
      fs.mkdirSync(clash);
      fs.writeFileSync(path.join(clash, 'old.txt'), 'old');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      await provider.moveTo(new FileSystemItem(srcDir, true));
      assert.ok(fs.existsSync(path.join(clash, 'a.txt')));
      assert.ok(!fs.existsSync(path.join(clash, 'old.txt')));
      assert.ok(!fs.existsSync(srcDir));
    });

    test('folder collision on move: cancel leaves both folders untouched', async () => {
      const clash = path.join(destDir, 'src');
      fs.mkdirSync(clash);
      fs.writeFileSync(path.join(clash, 'old.txt'), 'old');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
      await provider.moveTo(new FileSystemItem(srcDir, true));
      assert.ok(fs.existsSync(file));
      assert.ok(fs.existsSync(path.join(clash, 'old.txt')));
    });

    test('folder collision on copy: Replace yields the source folder content', async () => {
      const clash = path.join(destDir, 'src');
      fs.mkdirSync(clash);
      fs.writeFileSync(path.join(clash, 'old.txt'), 'old');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      await provider.copyTo(new FileSystemItem(srcDir, true));
      assert.ok(fs.existsSync(path.join(clash, 'a.txt')));
      assert.ok(fs.existsSync(file));
    });

    // ── guards ───────────────────────────────────────────────────────────────

    test('cannot copy a folder into itself', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(srcDir);
      const err = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      await provider.copyTo(new FileSystemItem(srcDir, true));
      assert.ok(err.calledOnce);
      assert.deepStrictEqual(fs.readdirSync(srcDir), ['a.txt']);
    });

    test('cannot move a folder into a nested descendant', async () => {
      const deep = path.join(srcDir, 'a', 'b');
      fs.mkdirSync(deep, { recursive: true });
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(deep);
      const err = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      await provider.moveTo(new FileSystemItem(srcDir, true));
      assert.ok(err.calledOnce);
      assert.ok(fs.existsSync(file));
    });

    test('cannot move a nested folder over its own ancestor of the same name', async () => {
      const inner = path.join(srcDir, 'src');
      fs.mkdirSync(inner);
      fs.writeFileSync(path.join(inner, 'keep.txt'), 'keep');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(tmpDir);
      const warn = sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      const err = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      await provider.moveTo(new FileSystemItem(inner, true));
      assert.ok(err.calledOnce);
      assert.ok(warn.notCalled);
      assert.ok(fs.existsSync(path.join(inner, 'keep.txt')));
      assert.ok(fs.existsSync(file));
    });

    test('a failing file operation reports an error and leaves pins alone', async () => {
      const { ctx, provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      const err = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      const missing = path.join(srcDir, 'gone.txt');
      await provider.moveTo(new FileSystemItem(missing, false));
      assert.ok(err.calledOnce);
      assert.deepStrictEqual(stored(ctx), [{ path: srcDir }]);
      assert.deepStrictEqual(fs.readdirSync(destDir), []);
      assert.deepStrictEqual(fs.readdirSync(srcDir), ['a.txt']);
    });

    // ── drag and drop ────────────────────────────────────────────────────────

    test('dropping a pinned root onto a nested item shows an error and keeps the order', async () => {
      const sub = path.join(srcDir, 'sub');
      fs.mkdirSync(sub);
      const { ctx, provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      provider.handleDrag([roots[0] as PinnedItemRoot], dt);
      const err = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      await provider.handleDrop(new FileSystemItem(sub, true), dt);
      assert.ok(err.calledOnce);
      assert.deepStrictEqual(stored(ctx).map(p => p.path), [srcDir, destDir]);
      assert.ok(fs.existsSync(sub));
    });

    test('moving updates the pin in the OTHER scope too', async () => {
      const { ctx, provider } = await makeProvider([{ path: srcDir }]);
      await ctx.globalState.update(STATE_KEY, [{ path: srcDir, alias: 'G' }]);
      pickFolder(destDir);
      await provider.moveTo(new PinnedItemRoot(srcDir, true, false, 'single', 'src', false));
      const moved = path.join(destDir, 'src');
      assert.deepStrictEqual(stored(ctx), [{ path: moved }]);
      assert.deepStrictEqual(ctx.globalState.get<Pin[]>(STATE_KEY, []), [{ path: moved, alias: 'G' }]);
    });

    test('replacing a folder drops pins that pointed at content the replacement lacks', async () => {
      const clash = path.join(destDir, 'src');
      fs.mkdirSync(clash);
      fs.writeFileSync(path.join(clash, 'a.txt'), 'x');
      fs.writeFileSync(path.join(clash, 'old.txt'), 'old');
      const { ctx, provider } = await makeProvider([
        { path: path.join(clash, 'old.txt') },
        { path: path.join(clash, 'a.txt') },
      ]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      await provider.moveTo(new FileSystemItem(srcDir, true));
      assert.deepStrictEqual(stored(ctx).map(p => p.path), [path.join(clash, 'a.txt')]);
    });

    test('copying over a pinned file keeps that pin', async () => {
      const existing = path.join(destDir, 'a.txt');
      fs.writeFileSync(existing, 'old');
      const { ctx, provider } = await makeProvider([{ path: existing, alias: 'Keep' }]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      await provider.copyTo(new FileSystemItem(file, false));
      assert.deepStrictEqual(stored(ctx), [{ path: existing, alias: 'Keep' }]);
      assert.strictEqual(fs.readFileSync(existing, 'utf8'), 'hello');
    });

    test('when source and target are both pinned, the first pin (and its alias) survives', async () => {
      const existing = path.join(destDir, 'a.txt');
      fs.writeFileSync(existing, 'old');
      const { ctx, provider } = await makeProvider([
        { path: file, alias: 'Src' },
        { path: existing, alias: 'Dst' },
      ]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      await provider.moveTo(new FileSystemItem(file, false));
      assert.deepStrictEqual(stored(ctx), [{ path: existing, alias: 'Src' }]);
    });

    test('Replace can swap a file for a folder of the same name', async () => {
      const clash = path.join(destDir, 'src');
      fs.writeFileSync(clash, 'i am a file');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      await provider.moveTo(new FileSystemItem(srcDir, true));
      assert.ok(fs.statSync(clash).isDirectory());
      assert.ok(fs.existsSync(path.join(clash, 'a.txt')));
    });

    test('Replace can swap a folder for a file of the same name', async () => {
      const clash = path.join(destDir, 'a.txt');
      fs.mkdirSync(clash);
      fs.writeFileSync(path.join(clash, 'inside.txt'), '');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      await provider.moveTo(new FileSystemItem(file, false));
      assert.ok(fs.statSync(clash).isFile());
      assert.strictEqual(fs.readFileSync(clash, 'utf8'), 'hello');
    });

    test('dragging a folder together with its own child moves both without errors', async () => {
      const sub = path.join(srcDir, 'sub');
      fs.mkdirSync(sub);
      const child = path.join(sub, 'x.txt');
      fs.writeFileSync(child, 'x');
      const { provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      dt.set(FS_MIME, new vscode.DataTransferItem([child, sub]));
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      const err = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.ok(err.notCalled);
      assert.strictEqual(fs.readFileSync(path.join(destDir, 'sub', 'x.txt'), 'utf8'), 'x');
      assert.ok(!fs.existsSync(sub));
    });

    test('copy with Replace never rewrites the pinned source', async () => {
      fs.writeFileSync(path.join(destDir, 'a.txt'), 'old');
      const { ctx, provider } = await makeProvider([{ path: file }]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      await provider.copyTo(new FileSystemItem(file, false));
      assert.deepStrictEqual(stored(ctx), [{ path: file }]);
    });

    test('copy-Replace of a folder prunes pins to content the copy lacks', async () => {
      const clash = path.join(destDir, 'src');
      fs.mkdirSync(clash);
      fs.writeFileSync(path.join(clash, 'old.txt'), 'old');
      const { ctx, provider } = await makeProvider([{ path: path.join(clash, 'old.txt') }]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      await provider.copyTo(new FileSystemItem(srcDir, true));
      assert.deepStrictEqual(stored(ctx), []);
    });

    test('copy-Replace of a folder removes files that are not in the source', async () => {
      const clash = path.join(destDir, 'src');
      fs.mkdirSync(clash);
      fs.writeFileSync(path.join(clash, 'old.txt'), 'old');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      await provider.copyTo(new FileSystemItem(srcDir, true));
      assert.ok(fs.existsSync(path.join(clash, 'a.txt')));
      assert.ok(!fs.existsSync(path.join(clash, 'old.txt')));
    });

    test('copy-Replace of a folder over a file of the same name works', async () => {
      const clash = path.join(destDir, 'src');
      fs.writeFileSync(clash, 'i am a file');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      await provider.copyTo(new FileSystemItem(srcDir, true));
      assert.ok(fs.statSync(clash).isDirectory());
      assert.ok(fs.existsSync(path.join(clash, 'a.txt')));
    });

    test('a pin whose file vanished is still rewritten when its folder moves', async () => {
      const ghost = path.join(srcDir, 'ghost.txt');
      fs.writeFileSync(ghost, '');
      const { ctx, provider } = await makeProvider([{ path: ghost }]);
      fs.rmSync(ghost);
      pickFolder(destDir);
      await provider.moveTo(new FileSystemItem(srcDir, true));
      assert.deepStrictEqual(stored(ctx), [{ path: path.join(destDir, 'src', 'ghost.txt') }]);
    });

    test('a folder can be moved into a sibling whose name starts with its own', async () => {
      const sibling = path.join(tmpDir, 'src-other');
      fs.mkdirSync(sibling);
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(sibling);
      const err = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      await provider.moveTo(new FileSystemItem(srcDir, true));
      assert.ok(err.notCalled);
      assert.ok(fs.existsSync(path.join(sibling, 'src', 'a.txt')));
    });

    test('a drag with a folder and a look-alike sibling moves both', async () => {
      const lookalike = path.join(tmpDir, 'src-2');
      fs.mkdirSync(lookalike);
      fs.writeFileSync(path.join(lookalike, 'b.txt'), '');
      const { provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      dt.set(FS_MIME, new vscode.DataTransferItem([srcDir, lookalike]));
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.ok(fs.existsSync(path.join(destDir, 'src', 'a.txt')));
      assert.ok(fs.existsSync(path.join(destDir, 'src-2', 'b.txt')));
    });

    test('pins are saved even when the LAST item of a drag fails', async () => {
      const sub = path.join(srcDir, 'sub');
      fs.mkdirSync(sub);
      const { ctx, provider } = await makeProvider([{ path: srcDir }, { path: destDir }, { path: sub }]);
      const roots = await provider.getChildren(undefined);
      const ghost = path.join(srcDir, 'ghost.txt');
      const dt = new vscode.DataTransfer();
      dt.set(FS_MIME, new vscode.DataTransferItem([sub, ghost]));
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.deepStrictEqual(stored(ctx).map(p => p.path), [srcDir, destDir, path.join(destDir, 'sub')]);
    });

    test('a drop where every item fails does not refresh or touch storage', async () => {
      const { ctx, provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      let fired = 0;
      provider.onDidChangeTreeData(() => { fired++; });
      const dt = new vscode.DataTransfer();
      dt.set(FS_MIME, new vscode.DataTransferItem([path.join(srcDir, 'ghost.txt')]));
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.strictEqual(fired, 0);
      assert.deepStrictEqual(stored(ctx).map(p => p.path), [srcDir, destDir]);
    });

    test('a mixed root + item drag moves the item and leaves pin order alone', async () => {
      const { ctx, provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      provider.handleDrag([roots[0] as PinnedItemRoot, new FileSystemItem(file, false)], dt);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.ok(fs.existsSync(path.join(destDir, 'a.txt')));
      assert.deepStrictEqual(stored(ctx).map(p => p.path), [srcDir, destDir]);
    });

    test('dragging a pinned root before another really reorders', async () => {
      const { ctx, provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      provider.handleDrag([roots[1] as PinnedItemRoot], dt);
      await provider.handleDrop(roots[0] as PinnedItemRoot, dt);
      assert.deepStrictEqual(stored(ctx).map(p => p.path), [destDir, srcDir]);
    });

    test('confirmDragAndDrop is read from the explorer section', async () => {
      const { provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      provider.handleDrag([new FileSystemItem(file, false)], dt);
      sandbox.stub(vscode.workspace, 'getConfiguration').callsFake(((section?: string) => ({
        get: (key: string, def?: unknown) =>
          key === 'confirmDragAndDrop' ? section !== 'explorer' : def,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any);
      const warn = sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.ok(warn.notCalled);
      assert.ok(fs.existsSync(path.join(destDir, 'a.txt')));
    });

    test('"already in that folder" is shown for copy only', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(srcDir);
      const info = sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
      await provider.copyTo(new FileSystemItem(file, false));
      assert.ok(info.calledOnce);
      await provider.moveTo(new FileSystemItem(file, false));
      assert.ok(info.calledOnce);
    });

    test('the folder picker only offers folders and starts at the item\'s parent', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      const open = pickFolder(destDir);
      await provider.copyTo(new FileSystemItem(file, false));
      assert.ok(open.calledOnce);
      const opts = open.firstCall.args[0] as vscode.OpenDialogOptions;
      assert.strictEqual(opts.canSelectFolders, true);
      assert.strictEqual(opts.canSelectFiles, false);
      assert.strictEqual(opts.canSelectMany, false);
      assert.strictEqual(opts.defaultUri?.fsPath, srcDir);
    });

    test('a picker that returns no folders changes nothing', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      sandbox.stub(vscode.window, 'showOpenDialog').resolves([]);
      await provider.moveTo(new FileSystemItem(file, false));
      assert.ok(fs.existsSync(file));
    });

    test('while sorted, collapsing two pins into one leaves a single-position root', async () => {
      const existing = path.join(destDir, 'a.txt');
      fs.writeFileSync(existing, 'old');
      const { provider } = await makeProvider([{ path: file }, { path: existing }]);
      sandbox.stub(vscode.workspace, 'getConfiguration').returns({
        get: (key: string, def?: unknown) => key === 'sortPins' ? 'alias' : def,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      await provider.moveTo(new FileSystemItem(file, false));
      const roots = await provider.getChildren(undefined);
      assert.strictEqual(roots.length, 1);
      assert.strictEqual(roots[0].contextValue, 'pinnedFileRootSingle');
    });

    test('Replace moves the existing target to the Trash instead of deleting it', async () => {
      const existing = path.join(destDir, 'a.txt');
      fs.writeFileSync(existing, 'old');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      await provider.moveTo(new FileSystemItem(file, false));
      assert.deepStrictEqual(trashed, [existing]);
      assert.strictEqual(fs.readFileSync(existing, 'utf8'), 'hello');
    });

    test('no Trash call when there is no collision', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      await provider.moveTo(new FileSystemItem(file, false));
      assert.deepStrictEqual(trashed, []);
    });

    test('if the Trash step fails, nothing is changed', async () => {
      const existing = path.join(destDir, 'a.txt');
      fs.writeFileSync(existing, 'old');
      const { ctx, provider } = await makeProvider([{ path: file }]);
      pickFolder(destDir);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Replace' as never);
      const err = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      (provider.trashItem as sinon.SinonStub).callsFake(() => Promise.reject(new Error('no trash')));
      await provider.moveTo(new FileSystemItem(file, false));
      assert.ok(err.calledOnce);
      assert.strictEqual(fs.readFileSync(existing, 'utf8'), 'old');
      assert.ok(fs.existsSync(file));
      assert.deepStrictEqual(stored(ctx), [{ path: file }]);
    });

    test('the Replace prompt tells the user the old item goes to the Trash', async () => {
      fs.writeFileSync(path.join(destDir, 'a.txt'), 'old');
      const { provider } = await makeProvider([{ path: srcDir }]);
      pickFolder(destDir);
      const warn = sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
      await provider.copyTo(new FileSystemItem(file, false));
      const opts = warn.firstCall.args[1] as { modal: boolean; detail: string };
      assert.strictEqual(opts.modal, true);
      assert.match(opts.detail, /Trash/);
    });

    test('an open editor follows a moved file', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      await vscode.window.showTextDocument(doc);
      pickFolder(destDir);
      await provider.moveTo(new FileSystemItem(file, false));
      const moved = path.join(destDir, 'a.txt');
      assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, moved);
      assert.strictEqual(vscode.window.activeTextEditor?.document.getText(), 'hello');
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('an open editor follows when its parent folder is moved', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      await vscode.window.showTextDocument(doc);
      pickFolder(destDir);
      await provider.moveTo(new FileSystemItem(srcDir, true));
      assert.strictEqual(
        vscode.window.activeTextEditor?.document.uri.fsPath,
        path.join(destDir, 'src', 'a.txt')
      );
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('a dirty editor keeps its unsaved edits when its file is moved', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      const editor = await vscode.window.showTextDocument(doc);
      await editor.edit(b => b.insert(new vscode.Position(0, 0), 'UNSAVED '));
      pickFolder(destDir);
      await provider.moveTo(new FileSystemItem(file, false));
      assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, path.join(destDir, 'a.txt'));
      assert.strictEqual(vscode.window.activeTextEditor?.document.getText(), 'UNSAVED hello');
      assert.ok(vscode.window.activeTextEditor?.document.isDirty);
      await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    });

    test('handleDrag: nested item sets only the items MIME', () => {
      const dt = new vscode.DataTransfer();
      new PinboardProvider(createMockContext()).handleDrag([new FileSystemItem(file, false)], dt);
      assert.deepStrictEqual(dt.get(FS_MIME)?.value, [file]);
      assert.strictEqual(dt.get('application/vscode.tree.pinboard'), undefined);
    });

    test('handleDrag: pinned root sets only the pin-reorder MIME', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      provider.handleDrag([roots[0] as PinnedItemRoot], dt);
      assert.strictEqual(dt.get(FS_MIME), undefined);
      assert.deepStrictEqual(dt.get('application/vscode.tree.pinboard')?.value, [srcDir]);
    });

    test('dragging several items moves all of them with one confirmation', async () => {
      const b = path.join(srcDir, 'b.txt');
      fs.writeFileSync(b, 'bee');
      const { provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      const dt = dragOf(provider, [new FileSystemItem(file, false), new FileSystemItem(b, false)]);
      const warn = sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.ok(warn.calledOnce);
      assert.deepStrictEqual(fs.readdirSync(destDir).sort(), ['a.txt', 'b.txt']);
      assert.deepStrictEqual(fs.readdirSync(srcDir), []);
    });

    test('dropping items already in the target folder does nothing and asks nothing', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      const roots = await provider.getChildren(undefined);
      const dt = dragOf(provider, [new FileSystemItem(file, false)]);
      const warn = sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      await provider.handleDrop(roots[0] as PinnedItemRoot, dt);
      assert.ok(warn.notCalled);
      assert.ok(fs.existsSync(file));
    });

    test('dragging a folder onto itself is refused', async () => {
      const { provider } = await makeProvider([{ path: srcDir }]);
      const dt = dragOf(provider, [new FileSystemItem(srcDir, true)]);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      const err = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      await provider.handleDrop(new FileSystemItem(srcDir, true), dt);
      assert.ok(err.calledOnce);
      assert.ok(fs.existsSync(file));
    });

    test('dragging a folder onto its own subfolder is refused', async () => {
      const sub = path.join(srcDir, 'sub');
      fs.mkdirSync(sub);
      const { provider } = await makeProvider([{ path: srcDir }]);
      const dt = dragOf(provider, [new FileSystemItem(srcDir, true)]);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      const err = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      await provider.handleDrop(new FileSystemItem(sub, true), dt);
      assert.ok(err.calledOnce);
      assert.ok(fs.existsSync(file));
    });

    test('explorer.confirmDragAndDrop=false moves without asking', async () => {
      const { provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      const dt = dragOf(provider, [new FileSystemItem(file, false)]);
      sandbox.stub(vscode.workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => key === 'confirmDragAndDrop' ? false : defaultVal,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const warn = sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.ok(warn.notCalled);
      assert.ok(fs.existsSync(path.join(destDir, 'a.txt')));
    });

    test('drag-move onto a folder with a same-named item asks to replace', async () => {
      fs.writeFileSync(path.join(destDir, 'a.txt'), 'existing');
      const { provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      const dt = dragOf(provider, [new FileSystemItem(file, false)]);
      const warn = sandbox.stub(vscode.window, 'showWarningMessage');
      warn.onFirstCall().resolves('Move' as never);
      warn.onSecondCall().resolves(undefined);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.strictEqual(warn.callCount, 2);
      assert.strictEqual(fs.readFileSync(path.join(destDir, 'a.txt'), 'utf8'), 'existing');
      assert.ok(fs.existsSync(file));
    });

    test('a partially failing multi-item drag still moves the valid items', async () => {
      const b = path.join(srcDir, 'b.txt');
      fs.writeFileSync(b, 'bee');
      const { provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      const ghost = path.join(srcDir, 'ghost.txt');
      const dt = dragOf(provider, [new FileSystemItem(ghost, false), new FileSystemItem(b, false)]);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.ok(fs.existsSync(path.join(destDir, 'b.txt')));
    });

    test('drop payload with a stale path does not throw or change pins', async () => {
      const { ctx, provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      dt.set(FS_MIME, new vscode.DataTransferItem([path.join(tmpDir, 'never-existed.txt')]));
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      const err = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.ok(err.calledOnce);
      assert.deepStrictEqual(stored(ctx).map(p => p.path), [srcDir, destDir]);
    });

    test('an empty drag payload is ignored', async () => {
      const { provider } = await makeProvider([{ path: srcDir }, { path: destDir }]);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      dt.set(FS_MIME, new vscode.DataTransferItem([]));
      const warn = sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.ok(warn.notCalled);
    });

    test('dragging a nested folder that contains a pin updates that pin', async () => {
      const sub = path.join(srcDir, 'sub');
      fs.mkdirSync(sub);
      const { ctx, provider } = await makeProvider([{ path: srcDir }, { path: destDir }, { path: sub, alias: 'S' }]);
      const roots = await provider.getChildren(undefined);
      const dt = dragOf(provider, [new FileSystemItem(sub, true)]);
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Move' as never);
      await provider.handleDrop(roots[1] as PinnedItemRoot, dt);
      assert.deepStrictEqual(stored(ctx).map(p => p.path), [srcDir, destDir, path.join(destDir, 'sub')]);
      assert.strictEqual(stored(ctx)[2].alias, 'S');
    });
  });
});
