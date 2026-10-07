import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { PinboardProvider, PinnedItemRoot, FileSystemItem, Pin } from '../../PinboardProvider';
import { createMockContext, makeTempDir, removeTempDir, STATE_KEY } from '../helpers';

suite('PinboardProvider: tree, labels and reveal', () => {
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
      const parent = await provider.getParent(roots[0]);
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
      const parent = await provider.getParent(child) as PinnedItemRoot;
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
      const parent = await provider.getParent(deepItem) as FileSystemItem;
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
      const parent = await provider.getParent(child) as PinnedItemRoot;
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
});
