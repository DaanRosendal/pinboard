import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { PinboardProvider, PinnedItemRoot, FileSystemItem, Pin } from '../../PinboardProvider';
import { createMockContext, makeTempDir, removeTempDir, STATE_KEY } from '../helpers';

suite('PinboardProvider: pins', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
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
});
