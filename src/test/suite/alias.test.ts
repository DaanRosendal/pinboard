import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { PinboardProvider, PinnedItemRoot, Pin } from '../../PinboardProvider';
import { createMockContext, makeTempDir, removeTempDir, STATE_KEY } from '../helpers';

suite('PinboardProvider: aliases', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
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
});
