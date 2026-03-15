import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { PinboardProvider, PinnedItemRoot, FileSystemItem } from '../../PinboardProvider';
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
      await ctx.globalState.update(STATE_KEY, [dirA]);
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
      await ctx.globalState.update(STATE_KEY, [dirA, dirB]);
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
      await ctx.globalState.update(STATE_KEY, [dirA, dirB]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.ok(items[1].contextValue?.endsWith('Last'));
    });

    test('middle of three → contextValue ends with Middle', async () => {
      const [a, b, c] = ['a', 'b', 'c'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [a, b, c]);
      const provider = new PinboardProvider(ctx);
      const items = await provider.getChildren(undefined);
      assert.ok(items[1].contextValue?.endsWith('Middle'));
    });

    test('active folder → contextValue contains Active', async () => {
      const wsFolderPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsFolderPath) { return; }
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [wsFolderPath]);
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
      await ctx.globalState.update(STATE_KEY, [dirA]);
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
      await ctx.globalState.update(STATE_KEY, [dirA, nonexistent]);
      new PinboardProvider(ctx);
      const stored = ctx.globalState.get<string[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [dirA]);
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
      await ctx.globalState.update(STATE_KEY, [tmpDir]);
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
      await ctx.globalState.update(STATE_KEY, [tmpDir]);
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
      await ctx.globalState.update(STATE_KEY, [filePath]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      const children = await provider.getChildren(roots[0] as PinnedItemRoot);
      assert.strictEqual(children.length, 0);
    });

    test('returns [] when directory read fails', async () => {
      const nonexistentDir = path.join(tmpDir, 'nonexistent');
      const root = new PinnedItemRoot(nonexistentDir, true, false, 'single');
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
      const root = new PinnedItemRoot(dirA, true, false, 'single');
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
      await ctx.globalState.update(STATE_KEY, [a, b, c]);
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
      await ctx.globalState.update(STATE_KEY, [a, b, c]);
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
      await ctx.globalState.update(STATE_KEY, [a, b]);
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
      await ctx.globalState.update(STATE_KEY, [pathA, pathB]);
      const provider = new PinboardProvider(ctx);
      const roots = await provider.getChildren(undefined);
      await provider.removeItem(roots[0] as PinnedItemRoot);
      const remaining = await provider.getChildren(undefined);
      assert.strictEqual(remaining.length, 1);
      assert.strictEqual((remaining[0] as PinnedItemRoot).itemPath, pathB);
    });
  });

  // ── moveItemUp / moveItemDown ──────────────────────────────────────────────

  suite('moveItemUp / moveItemDown', () => {
    let tmpDir: string;

    setup(() => { tmpDir = makeTempDir(); });
    teardown(() => { removeTempDir(tmpDir); });

    async function makeProvider(paths: string[]): Promise<PinboardProvider> {
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, paths);
      return new PinboardProvider(ctx);
    }

    test('moveUp swaps item with predecessor', async () => {
      const [a, b, c] = ['a', 'b', 'c'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const provider = await makeProvider([a, b, c]);
      const roots = await provider.getChildren(undefined);
      await provider.moveItemUp(roots[1] as PinnedItemRoot);
      const after = await provider.getChildren(undefined);
      assert.deepStrictEqual(after.map(i => (i as PinnedItemRoot).itemPath), [b, a, c]);
    });

    test('moveUp is no-op when already first', async () => {
      const [a, b] = ['a', 'b'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const provider = await makeProvider([a, b]);
      const roots = await provider.getChildren(undefined);
      await provider.moveItemUp(roots[0] as PinnedItemRoot);
      const after = await provider.getChildren(undefined);
      assert.deepStrictEqual(after.map(i => (i as PinnedItemRoot).itemPath), [a, b]);
    });

    test('moveDown swaps item with successor', async () => {
      const [a, b, c] = ['a', 'b', 'c'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const provider = await makeProvider([a, b, c]);
      const roots = await provider.getChildren(undefined);
      await provider.moveItemDown(roots[1] as PinnedItemRoot);
      const after = await provider.getChildren(undefined);
      assert.deepStrictEqual(after.map(i => (i as PinnedItemRoot).itemPath), [a, c, b]);
    });

    test('moveDown is no-op when already last', async () => {
      const [a, b] = ['a', 'b'].map(n => { const p = path.join(tmpDir, n); fs.mkdirSync(p); return p; });
      const provider = await makeProvider([a, b]);
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
      await ctx.globalState.update(STATE_KEY, [dirA]);
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
      await ctx.globalState.update(STATE_KEY, [oldPath]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showInputBox').resolves('newname.txt');
      const roots = await provider.getChildren(undefined);
      await provider.renamePinnedItem(roots[0] as PinnedItemRoot);
      const newPath = path.join(tmpDir, 'newname.txt');
      assert.ok(fs.existsSync(newPath));
      assert.ok(!fs.existsSync(oldPath));
      const stored = ctx.globalState.get<string[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [newPath]);
    });

    test('no-op when input box is cancelled', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [filePath]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showInputBox').resolves(undefined);
      const roots = await provider.getChildren(undefined);
      await provider.renamePinnedItem(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<string[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [filePath]);
    });

    test('no-op when new name equals old name', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [filePath]);
      const provider = new PinboardProvider(ctx);
      sandbox.stub(vscode.window, 'showInputBox').resolves('file.txt');
      const roots = await provider.getChildren(undefined);
      await provider.renamePinnedItem(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<string[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [filePath]);
    });

    test('shows error and does not update storage when rename throws', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [filePath]);
      const provider = new PinboardProvider(ctx);
      // Delete the file after loading so vscode.workspace.fs.rename fails (source not found)
      fs.unlinkSync(filePath);
      sandbox.stub(vscode.window, 'showInputBox').resolves('newname.txt');
      const showError = sandbox.stub(vscode.window, 'showErrorMessage');
      const item = new PinnedItemRoot(filePath, false, false, 'single');
      await provider.renamePinnedItem(item);
      assert.ok(showError.calledOnce);
      const stored = ctx.globalState.get<string[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [filePath]);
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
      await ctx.globalState.update(STATE_KEY, [filePath]);
      const provider = new PinboardProvider(ctx);
      (sandbox.stub(vscode.window, 'showWarningMessage') as sinon.SinonStub).resolves('Move to Trash');
      // Use real vscode.workspace.fs.delete (moves to trash); just assert storage is cleared
      const roots = await provider.getChildren(undefined);
      await provider.deletePinnedItem(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<string[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, []);
    });

    test('no-op when modal is dismissed', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, '');
      const ctx = createMockContext();
      await ctx.globalState.update(STATE_KEY, [filePath]);
      const provider = new PinboardProvider(ctx);
      (sandbox.stub(vscode.window, 'showWarningMessage') as sinon.SinonStub).resolves(undefined);
      const roots = await provider.getChildren(undefined);
      await provider.deletePinnedItem(roots[0] as PinnedItemRoot);
      const stored = ctx.globalState.get<string[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [filePath]);
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

    test('returns parsed presets from valid .pinboard.json', () => {
      const json = JSON.stringify({ presets: [{ name: 'dev', paths: ['src', 'tests'] }] });
      fs.writeFileSync(path.join(tmpDir, '.pinboard.json'), json);
      const provider = makeProvider(tmpDir);
      const result = provider.readPresets();
      assert.ok(result !== null);
      assert.strictEqual(result!.length, 1);
      assert.strictEqual(result![0].name, 'dev');
      assert.deepStrictEqual(result![0].paths, ['src', 'tests']);
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
      const stored = ctx.workspaceState.get<string[]>(STATE_KEY, []);
      assert.deepStrictEqual(stored, [realDir]);
    });

    test('does nothing when scope is global', async () => {
      const ctx = createMockContext();
      const provider = new PinboardProvider(ctx);
      sandbox.stub(provider, 'getScope').returns('global');
      await provider.applyPreset({ name: 'test', paths: ['src'] });
      const stored = ctx.workspaceState.get<string[]>(STATE_KEY, []);
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
      assert.deepStrictEqual(ctx.workspaceState.get<string[]>(STATE_KEY, []), [filePath]);
      assert.deepStrictEqual(ctx.globalState.get<string[]>(STATE_KEY, []), []);
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
      await ctx.workspaceState.update(STATE_KEY, [dirA]);
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
});
