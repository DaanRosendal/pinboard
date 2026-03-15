import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension activation', () => {
  test('activates without error', async () => {
    const ext = vscode.extensions.getExtension('daanrosendal.pinboard');
    await ext?.activate();
    assert.ok(ext?.isActive);
  });
});
