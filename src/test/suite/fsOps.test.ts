import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { PinboardProvider, PinnedItemRoot, FileSystemItem, Pin } from '../../PinboardProvider';
import { createMockContext, makeTempDir, removeTempDir, STATE_KEY } from '../helpers';

suite('PinboardProvider: file operations', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
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
