import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { PinboardProvider, PinnedItemRoot, FileSystemItem, Pin } from '../../PinboardProvider';
import { createMockContext, makeTempDir, removeTempDir, STATE_KEY } from '../helpers';

suite('PinboardProvider: compact folders', () => {
  let sandbox: sinon.SinonSandbox;
  let tmpDir: string;

  setup(() => {
    sandbox = sinon.createSandbox();
    tmpDir = makeTempDir();
  });

  teardown(() => {
    sandbox.restore();
    removeTempDir(tmpDir);
  });

  function mkdirs(...parts: string[]): string {
    const p = path.join(tmpDir, ...parts);
    fs.mkdirSync(p, { recursive: true });
    return p;
  }

  async function makeProvider(pins: Pin[] = [{ path: tmpDir }]) {
    const ctx = createMockContext();
    await ctx.workspaceState.update(STATE_KEY, pins);
    return new PinboardProvider(ctx);
  }

  async function rows(provider: PinboardProvider, parent?: PinnedItemRoot | FileSystemItem) {
    const target = parent ?? (await provider.getChildren(undefined))[0];
    return (await provider.getChildren(target)) as FileSystemItem[];
  }

  function stubCompact(value: boolean, separator?: string): void {
    sandbox.stub(vscode.workspace, 'getConfiguration').returns({
      get: (key: string, defaultVal?: unknown) => {
        if (key === 'compactFolders') return value;
        if (key === 'compactFolderSeparator' && separator !== undefined) return separator;
        return defaultVal;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  suite('getChildren', () => {
    test('merges a chain of single-folder folders into one row', async () => {
      const c = mkdirs('a', 'b', 'c');
      fs.writeFileSync(path.join(c, 'f.txt'), '');
      const [row] = await rows(await makeProvider());
      assert.strictEqual(row.label, 'a/b/c');
      assert.strictEqual(row.itemPath, c);
      assert.strictEqual(row.id, c);
      assert.strictEqual(row.tooltip, c);
      assert.strictEqual(row.resourceUri?.fsPath, c);
      assert.strictEqual(row.contextValue, 'pinnedDirectory');
    });

    test('children of a merged row are the children of its deepest folder', async () => {
      const c = mkdirs('a', 'b', 'c');
      fs.writeFileSync(path.join(c, 'f.txt'), '');
      const provider = await makeProvider();
      const [row] = await rows(provider);
      const kids = await rows(provider, row);
      assert.deepStrictEqual(kids.map(k => k.itemPath), [path.join(c, 'f.txt')]);
    });

    test('stops at a folder with several entries', async () => {
      mkdirs('a', 'b');
      fs.writeFileSync(path.join(tmpDir, 'a', 'x.txt'), '');
      const [row] = await rows(await makeProvider());
      assert.strictEqual(row.label, 'a');
      assert.strictEqual(row.tooltip, undefined);
    });

    test('stops at a single file', async () => {
      const a = mkdirs('a');
      fs.writeFileSync(path.join(a, 'f.txt'), '');
      const [row] = await rows(await makeProvider());
      assert.strictEqual(row.label, 'a');
    });

    test('an empty folder ends the chain and is part of the row', async () => {
      const empty = mkdirs('a', 'b', 'empty');
      const [row] = await rows(await makeProvider());
      assert.strictEqual(row.label, 'a/b/empty');
      assert.strictEqual(row.itemPath, empty);
    });

    test('hidden VCS and OS entries do not stop a chain', async () => {
      mkdirs('a', 'b');
      const a = path.join(tmpDir, 'a');
      fs.mkdirSync(path.join(a, '.git'));
      fs.writeFileSync(path.join(a, '.DS_Store'), '');
      const [row] = await rows(await makeProvider());
      assert.strictEqual(row.label, 'a/b');
    });

    test('other dotfiles count as entries and stop a chain', async () => {
      mkdirs('a', 'b');
      fs.writeFileSync(path.join(tmpDir, 'a', '.env'), '');
      const [row] = await rows(await makeProvider());
      assert.strictEqual(row.label, 'a');
    });

    test('the pinned root is never merged with its child', async () => {
      mkdirs('only', 'child');
      const provider = await makeProvider();
      const [root] = (await provider.getChildren(undefined)) as PinnedItemRoot[];
      assert.strictEqual(root.label, path.basename(tmpDir));
      assert.strictEqual(root.itemPath, tmpDir);
      const [row] = await rows(provider, root);
      assert.strictEqual(row.label, 'only/child');
    });

    test('rows are ordered by their first segment, folders before files', async () => {
      mkdirs('z', 'y');
      mkdirs('m');
      fs.writeFileSync(path.join(tmpDir, 'm', '1.txt'), '');
      fs.writeFileSync(path.join(tmpDir, 'm', '2.txt'), '');
      fs.writeFileSync(path.join(tmpDir, 'a.txt'), '');
      const labels = (await rows(await makeProvider())).map(r => r.label);
      assert.deepStrictEqual(labels, ['m', 'z/y', 'a.txt']);
    });

    test('the setting off keeps one row per folder', async () => {
      mkdirs('a', 'b', 'c');
      stubCompact(false);
      const provider = await makeProvider();
      const [row] = await rows(provider);
      assert.strictEqual(row.label, 'a');
      assert.strictEqual(row.itemPath, path.join(tmpDir, 'a'));
      assert.strictEqual(row.tooltip, undefined);
      const [child] = await rows(provider, row);
      assert.strictEqual(child.label, 'b');
    });

    test('a chain is capped in depth', async () => {
      mkdirs(...Array.from({ length: 60 }, () => 'd'));
      const [row] = await rows(await makeProvider());
      assert.strictEqual((row.label as string).split('/').length, 51);
    });

    test('a symlinked folder is not followed', async function (this: Mocha.Context) {
      const a = mkdirs('a');
      const target = mkdirs('target');
      try {
        fs.symlinkSync(target, path.join(a, 'link'), 'dir');
      } catch {
        this.skip();
      }
      const labels = (await rows(await makeProvider())).map(r => r.label);
      assert.deepStrictEqual(labels, ['a', 'target']);
    });
  });

  suite('getParent', () => {
    test('a file in a merged row has that row as parent, which leads to the root', async () => {
      const c = mkdirs('a', 'b', 'c');
      const file = path.join(c, 'f.txt');
      fs.writeFileSync(file, '');
      const provider = await makeProvider();
      const parent = (await provider.getParent(new FileSystemItem(file, false))) as FileSystemItem;
      assert.strictEqual(parent.kind, 'fsitem');
      assert.strictEqual(parent.label, 'a/b/c');
      assert.strictEqual(parent.id, c);
      const top = (await provider.getParent(parent)) as PinnedItemRoot;
      assert.strictEqual(top.kind, 'root');
      assert.strictEqual(top.itemPath, tmpDir);
    });

    test('the parent of a merged row is the row above its first folder', async () => {
      const a = mkdirs('a');
      const c = mkdirs('a', 'b', 'c');
      fs.writeFileSync(path.join(a, 'x.txt'), '');
      fs.writeFileSync(path.join(c, 'f.txt'), '');
      const provider = await makeProvider();
      const [aRow] = await rows(provider);
      const kids = await rows(provider, aRow);
      const merged = kids.find(k => k.itemPath === c)!;
      assert.strictEqual(merged.label, 'b/c');
      const parent = (await provider.getParent(merged)) as FileSystemItem;
      assert.strictEqual(parent.id, aRow.id);
      assert.strictEqual(parent.label, aRow.label);
    });

    test('agrees with getChildren about ids and labels at every level', async () => {
      const deep = mkdirs('a', 'b', 'c', 'd');
      fs.writeFileSync(path.join(deep, 'f.txt'), '');
      fs.writeFileSync(path.join(deep, 'g.txt'), '');
      const provider = await makeProvider();
      const [row] = await rows(provider);
      const parent = (await provider.getParent(new FileSystemItem(path.join(deep, 'f.txt'), false))) as FileSystemItem;
      assert.strictEqual(parent.id, row.id);
      assert.strictEqual(parent.label, row.label);
    });

    test('never climbs past a pinned folder', async () => {
      const inner = mkdirs('a', 'b');
      const c = mkdirs('a', 'b', 'c');
      fs.writeFileSync(path.join(c, 'f.txt'), '');
      const provider = await makeProvider([{ path: tmpDir }, { path: inner }]);
      const row = (await provider.getParent(new FileSystemItem(path.join(c, 'f.txt'), false))) as FileSystemItem;
      assert.strictEqual(row.id, c);
      assert.strictEqual(row.label, 'c');
      const top = (await provider.getParent(row)) as PinnedItemRoot;
      assert.strictEqual(top.kind, 'root');
      assert.strictEqual(top.itemPath, inner);
    });

    test('with the setting off, the parent is the plain parent folder', async () => {
      const c = mkdirs('a', 'b', 'c');
      fs.writeFileSync(path.join(c, 'f.txt'), '');
      stubCompact(false);
      const parent = (await (await makeProvider()).getParent(new FileSystemItem(path.join(c, 'f.txt'), false))) as FileSystemItem;
      assert.strictEqual(parent.label, 'c');
      assert.strictEqual(parent.id, c);
    });
  });

  suite('revealActiveFile', () => {
    test('reveals a file inside a merged row by its own id', async () => {
      const c = mkdirs('a', 'b', 'c');
      const file = path.join(c, 'f.txt');
      fs.writeFileSync(file, '');
      const provider = await makeProvider();
      const tv = {
        visible: true,
        reveal: sandbox.stub().resolves(),
      } as unknown as vscode.TreeView<PinnedItemRoot | FileSystemItem>;
      provider.revealActiveFile(tv, file);
      const revealed = (tv.reveal as sinon.SinonStub).firstCall.args[0];
      assert.strictEqual(revealed.id, file);
      const parent = (await provider.getParent(revealed)) as FileSystemItem;
      const [row] = await rows(provider);
      assert.strictEqual(parent.id, row.id);
    });
  });

  suite('separator', () => {
    test('joins the names with the configured text', async () => {
      mkdirs('a', 'b', 'c');
      stubCompact(true, ' › ');
      const [row] = await rows(await makeProvider());
      assert.strictEqual(row.label, 'a › b › c');
    });

    test('an empty separator falls back to a slash', async () => {
      mkdirs('a', 'b', 'c');
      stubCompact(true, '');
      const [row] = await rows(await makeProvider());
      assert.strictEqual(row.label, 'a/b/c');
    });

    test('getParent rebuilds the row with the same separator', async () => {
      const c = mkdirs('a', 'b', 'c');
      const file = path.join(c, 'f.txt');
      fs.writeFileSync(file, '');
      stubCompact(true, ' / ');
      const provider = await makeProvider();
      const parent = (await provider.getParent(new FileSystemItem(file, false))) as FileSystemItem;
      assert.strictEqual(parent.label, 'a / b / c');
    });

    test('a single folder keeps its plain name', async () => {
      mkdirs('a');
      fs.writeFileSync(path.join(tmpDir, 'a', 'f.txt'), '');
      stubCompact(true, ' › ');
      const [row] = await rows(await makeProvider());
      assert.strictEqual(row.label, 'a');
    });
  });
});
