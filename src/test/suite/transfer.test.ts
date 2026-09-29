import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { PinboardProvider, PinnedItemRoot, FileSystemItem, Pin } from '../../PinboardProvider';
import { createMockContext, makeTempDir, removeTempDir, STATE_KEY } from '../helpers';

suite('PinboardProvider: move, copy and drag', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
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
