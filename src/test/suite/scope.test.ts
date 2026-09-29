import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { PinboardProvider, PinnedItemRoot, Pin } from '../../PinboardProvider';
import { createMockContext, makeTempDir, removeTempDir, STATE_KEY } from '../helpers';

suite('PinboardProvider: scopes', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
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
});
