import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { PinboardProvider, PinnedItemRoot, Pin } from '../../PinboardProvider';
import { createMockContext, makeTempDir, removeTempDir, STATE_KEY } from '../helpers';

suite('PinboardProvider: presets', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
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
});
