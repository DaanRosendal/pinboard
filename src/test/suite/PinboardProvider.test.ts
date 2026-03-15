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
      await ctx.globalState.update(STATE_KEY, [{ path: dirA }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: dirA }, { path: dirB }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: dirA }, { path: dirB }]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.ok(items[1].contextValue?.endsWith('Last'));
    });

    test('middle of three → contextValue ends with Middle', async () => {
      const [a, b, c] = ['a', 'b', 'c'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: a }, { path: b }, { path: c }]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.ok(items[1].contextValue?.endsWith('Middle'));
    });

    test('active folder → contextValue contains Active', async () => {
      const wsFolderPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsFolderPath) { return; }
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: wsFolderPath }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: dirA }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: dirA }, { path: nonexistent }]);
      new PinboardProvider(ctx);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
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
      await ctx.globalState.update(STATE_KEY, [{ path: tmpDir }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      const children = await provider.getChildren(roots[0] as PinnedItemRoot);
      assert.strictEqual(children.length, 3);
      assert.strictEqual(path.basename((children[0] as FileSystemItem).itemPath), 'a-dir');
      assert.strictEqual(path.basename((children[1] as FileSystemItem).itemPath), 'b-file.txt');
      assert.strictEqual(path.basename((children[2] as FileSystemItem).itemPath), 'c-file.txt');
    });

    test('excludes dotfiles', async () => {
      fs.writeFileSync(path.join(tmpDir, '.hidden'), '');
      fs.writeFileSync(path.join(tmpDir, 'visible.txt'), '');
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: tmpDir }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      const children = await provider.getChildren(roots[0] as PinnedItemRoot);
      assert.strictEqual(children.length, 1);
      assert.strictEqual(path.basename((children[0] as FileSystemItem).itemPath), 'visible.txt');
    });

    test('returns [] for a file root item', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: filePath }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: a }, { path: b }, { path: c }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: a }, { path: b }, { path: c }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: a }, { path: b }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: pathA }, { path: pathB }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: dirA, alias: 'My Alias' }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      await provider.removeItem(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
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
      await ctx.globalState.update(STATE_KEY, pins);
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
      await ctx.globalState.update(STATE_KEY, [{ path: dirA }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: oldPath }]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showInputBox').resolves('newname.txt');
      const roots = await provider.getChildren(undefined);
      await provider.renamePinnedItem(roots[0] as PinnedItemRoot);
      const newPath = path.join(tmpDir, 'newname.txt');
      assert.ok(fs.existsSync(newPath));
      assert.ok(!fs.existsSync(oldPath));
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: newPath }]);
    });

    test('no-op when input box is cancelled', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: filePath }]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showInputBox').resolves(undefined);
      const roots = await provider.getChildren(undefined);
      await provider.renamePinnedItem(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: filePath }]);
    });

    test('no-op when new name equals old name', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: filePath }]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showInputBox').resolves('file.txt');
      const roots = await provider.getChildren(undefined);
      await provider.renamePinnedItem(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: filePath }]);
    });

    test('shows error and does not update storage when rename throws', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: filePath }]);
      const provider = new PinboardProvider(ctx);
      // Delete the file after loading so vscode.workspace.fs.rename fails (source not found)
      fs.unlinkSync(filePath);
      sandbox.stub(vscode.window, 'showInputBox').resolves('newname.txt');
      const showError = sandbox.stub(vscode.window, 'showErrorMessage');
      const item = new PinnedItemRoot(filePath, false, false, 'single', path.basename(filePath), false);
      await provider.renamePinnedItem(item);
      assert.ok(showError.calledOnce);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: filePath }]);
    });

    test('alias is preserved after rename', async () => {
      const oldPath = path.join(tmpDir, 'oldname.txt');
      fs.writeFileSync(oldPath, '');
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: oldPath, alias: 'My File' }]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showInputBox').resolves('newname.txt');
      const roots = await provider.getChildren(undefined);
      await provider.renamePinnedItem(roots[0] as PinnedItemRoot);
      const newPath = path.join(tmpDir, 'newname.txt');
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
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
      await ctx.globalState.update(STATE_KEY, [{ path: filePath }]);
      const provider = new PinboardProvider(ctx);
      (sandbox.stub(vscode.window, 'showWarningMessage') as sinon.SinonStub).resolves('Move to Trash');
      // Use real vscode.workspace.fs.delete (moves to trash); just assert storage is cleared
      const roots = await provider.getChildren(undefined);
      await provider.deletePinnedItem(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, []);
    });

    test('no-op when modal is dismissed', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: filePath }]);
      const provider = new PinboardProvider(ctx);
      (sandbox.stub(vscode.window, 'showWarningMessage') as sinon.SinonStub).resolves(undefined);
      const roots = await provider.getChildren(undefined);
      await provider.deletePinnedItem(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
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
      const before = await provider.getChildren(undefined);
      assert.strictEqual(before.length, 0);
      sandbox.stub(provider, 'getScope').returns('workspace');
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
      await ctx.globalState.update(STATE_KEY, [{ path: dirA }]);
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirB, alias: 'My Dir' }]);
      const provider = new PinboardProvider(ctx);
      const globalItems = await provider.getChildren(undefined);
      assert.strictEqual((globalItems[0] as PinnedItemRoot).label, 'a');
      sandbox.stub(provider, 'getScope').returns('workspace');
      provider.onScopeChanged();
      const wsItems = await provider.getChildren(undefined);
      assert.strictEqual((wsItems[0] as PinnedItemRoot).label, 'My Dir');
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
      await ctx.globalState.update(STATE_KEY, [{ path: dirA }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: dirA, alias: 'My Alias' }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: dirA, alias: 'Keep Me' }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      sandbox.stub(vscode.window, 'showInputBox').resolves(undefined);
      await provider.setAlias(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: dirA, alias: 'Keep Me' }]);
    });

    test('alias persists in storage', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      sandbox.stub(vscode.window, 'showInputBox').resolves('Stored Alias');
      await provider.setAlias(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: dirA, alias: 'Stored Alias' }]);
    });

    test('alias removal persists in storage (no alias field)', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: dirA, alias: 'Remove Me' }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      sandbox.stub(vscode.window, 'showInputBox').resolves('');
      await provider.setAlias(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: dirA }]);
    });

    test('item contextValue ends with Aliased after alias is set', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: dirA, alias: 'X' }]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.ok((items[0] as PinnedItemRoot).contextValue?.endsWith('Aliased'));
    });

    test('item contextValue does NOT end with Aliased when no alias', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: dirA }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: dirA, alias: 'My Alias' }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      await provider.removeAlias(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: dirA }]);
      const after = await provider.getChildren(undefined);
      assert.strictEqual((after[0] as PinnedItemRoot).label, 'a');
      assert.ok(!(after[0] as PinnedItemRoot).contextValue?.endsWith('Aliased'));
    });

    test('no-op when item has no alias', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: dirA }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      await provider.removeAlias(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
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
      await ctx.globalState.update(STATE_KEY, [{ path: dirA }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: subDir }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: dirA }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: subDir, alias: 'Overridden' }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: wsFolderPath }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: subDir, alias: 'Temp Alias' }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: dirA, alias: 'Old Alias' }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      sandbox.stub(vscode.window, 'showInputBox').resolves('   ');
      await provider.setAlias(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: dirA }]);
      const after = await provider.getChildren(undefined);
      assert.strictEqual((after[0] as PinnedItemRoot).label, 'a');
    });

    test('same-value input is a no-op (no storage write)', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: dirA, alias: 'Same' }]);
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
      await ctx.globalState.update(STATE_KEY, [{ path: a }, { path: b, alias: 'B Alias' }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      await provider.moveItemUp(roots[1] as PinnedItemRoot);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: b, alias: 'B Alias' }, { path: a }]);
      const after = await provider.getChildren(undefined);
      assert.strictEqual((after[0] as PinnedItemRoot).label, 'B Alias');
    });

    test('alias survives moveDown', async () => {
      const [a, b] = ['a', 'b'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: a, alias: 'A Alias' }, { path: b }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      await provider.moveItemDown(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [{ path: b }, { path: a, alias: 'A Alias' }]);
      const after = await provider.getChildren(undefined);
      assert.strictEqual((after[1] as PinnedItemRoot).label, 'A Alias');
    });

    test('alias survives handleDrop reorder', async () => {
      const [a, b, c] = ['a', 'b', 'c'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: a }, { path: b, alias: 'B Alias' }, { path: c }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      const dt = new vscode.DataTransfer();
      provider.handleDrag([roots[1] as PinnedItemRoot], dt); // drag B
      await provider.handleDrop(roots[2] as PinnedItemRoot, dt); // drop onto C → order: a, b, c → a, c... no: insert before C
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
      // B is dropped before C → new order: A, B, C (B was between A and C; now B is inserted before C from remaining [A,C])
      // remaining after removing B: [A, C]; insert B before C at index 1 → [A, B, C]
      assert.deepStrictEqual(stored, [{ path: a }, { path: b, alias: 'B Alias' }, { path: c }]);
    });

    test('pinned file can have alias', async () => {
      const filePath = path.join(tmpDir, 'readme.md');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: filePath, alias: 'Docs' }]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.strictEqual((items[0] as PinnedItemRoot).label, 'Docs');
      assert.ok((items[0] as PinnedItemRoot).contextValue?.endsWith('Aliased'));
    });

    test('multiple items with mixed aliases display correctly', async () => {
      const [a, b, c] = ['a', 'b', 'c'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [
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
      await ctx.globalState.update(STATE_KEY, [{ path: oldDir, alias: 'Kept Alias' }]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      sandbox.stub(vscode.window, 'showInputBox').resolves('new');
      await provider.renamePinnedItem(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
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
      const items = await provider.getChildren(undefined);
      assert.strictEqual(items.length, 0);
    });

    test('same path can have different alias per scope', async () => {
      const dirA = path.join(tmpDir, 'a');
      fs.mkdirSync(dirA);
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [{ path: dirA, alias: 'Global Label' }]);
      await ctx.workspaceState.update(STATE_KEY, [{ path: dirA, alias: 'Workspace Label' }]);
      const provider = new PinboardProvider(ctx);
      const globalItems = await provider.getChildren(undefined);
      assert.strictEqual((globalItems[0] as PinnedItemRoot).label, 'Global Label');
      sandbox.stub(provider, 'getScope').returns('workspace');
      provider.onScopeChanged();
      const wsItems = await provider.getChildren(undefined);
      assert.strictEqual((wsItems[0] as PinnedItemRoot).label, 'Workspace Label');
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
      await ctx.globalState.update(STATE_KEY, [{ path: dirA, alias: 'My Alias' }]);
      const provider = new PinboardProvider(ctx);
      (sandbox.stub(vscode.window, 'showWarningMessage') as sinon.SinonStub).resolves('Move to Trash');
      const roots = await provider.getChildren(undefined);
      await provider.deletePinnedItem(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<Pin[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, []);
    });
  });
});
