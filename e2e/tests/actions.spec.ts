import * as path from 'path';
import { test, expect } from '../fixtures';

test('the inline X button unpins a folder', async ({ wb, workspace }) => {
  await wb.applyPreset('e2e');
  const other = wb.root(path.join(workspace, 'other'));
  await other.hover();
  await other.getByRole('button', { name: 'Unpin Folder' }).click();
  await expect.poll(() => wb.labels()).toEqual(['src', 'dest', 'notes.md']);
});

test('the inline X button unpins a file root', async ({ wb, workspace }) => {
  await wb.applyPreset('e2e');
  const notes = wb.root(path.join(workspace, 'notes.md'));
  await notes.hover();
  await notes.getByRole('button', { name: 'Unpin File' }).click();
  await expect.poll(() => wb.labels()).toEqual(['src', 'dest', 'other']);
});

test('the + button pins a file, and it opens on click', async ({ wb, workspace }) => {
  await (await wb.titleButton('Add File or Folder')).click();
  await wb.chooseFile(path.join(workspace, 'notes.md'));
  await expect.poll(() => wb.labels()).toEqual(['notes.md']);
  await wb.root(path.join(workspace, 'notes.md')).click();
  await expect(wb.page.getByRole('tab', { name: 'notes.md' })).toBeVisible();
});

test('the label style toggle switches a nested pin between name and relative path', async ({ wb, workspace }) => {
  await (await wb.titleButton('Add File or Folder')).click();
  await wb.chooseFolder(path.join(workspace, 'src', 'a'));
  await expect.poll(() => wb.labels()).toEqual(['a']);

  await wb.runCommand('Pinboard: Toggle Label Style (Folder Name / Relative Path)');
  await expect.poll(() => wb.labels()).toEqual(['src/a']);
  await wb.runCommand('Pinboard: Toggle Label Style (Folder Name / Relative Path)');
  await expect.poll(() => wb.labels()).toEqual(['a']);
});

test('Copy Path and Copy Relative Path put the right text on the clipboard', async ({ app, wb, workspace }) => {
  await wb.applyPreset('e2e');
  const src = wb.root(path.join(workspace, 'src'));
  await wb.contextMenu(src, 'Copy Path');
  await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(path.join(workspace, 'src'));
  await wb.contextMenu(src, 'Copy Relative Path');
  await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('src');
});

test('Open to the Side opens a file in a second editor group', async ({ wb, workspace }) => {
  await wb.applyPreset('e2e');
  await wb.root(path.join(workspace, 'src')).click();
  await wb.node('f1.txt').click();
  await expect(wb.page.getByRole('tab', { name: 'f1.txt' })).toBeVisible();
  await wb.contextMenu(wb.node('f2.txt'), 'Open to the Side');
  await expect(wb.page.getByRole('tab', { name: 'f2.txt' })).toBeVisible();
  await expect(wb.page.locator('.editor-group-container')).toHaveCount(2);
});

test('Open in Integrated Terminal shows the terminal in the folder', async ({ wb, workspace }) => {
  await wb.applyPreset('e2e');
  await wb.contextMenu(wb.root(path.join(workspace, 'src')), 'Open in Integrated Terminal');
  await expect(wb.page.locator('.terminal-wrapper').first()).toBeVisible();
});

test('Find in Folder opens Search scoped to the folder', async ({ wb, workspace }) => {
  await wb.applyPreset('e2e');
  await wb.contextMenu(wb.root(path.join(workspace, 'src')), 'Find in Folder...');
  const include = wb.page.locator('.search-widget ~ .query-details input, .file-types.include input').first();
  await expect(include).toHaveValue(path.join(workspace, 'src'));
});

test('Open in New Window opens the folder in a second window', async ({ app, wb, workspace }) => {
  await wb.applyPreset('e2e');
  const src = wb.root(path.join(workspace, 'src'));
  await src.hover();
  const opened = app.waitForEvent('window');
  await src.getByRole('button', { name: 'Open in New Window' }).click();
  const second = await opened;
  await second.locator('.monaco-workbench').waitFor();
  expect(app.windows().length).toBeGreaterThanOrEqual(2);
  await second.close();
});

test('global pins are separate from workspace pins and persist across scope switches', async ({ wb }) => {
  const explorerSrc = wb.page.locator('.explorer-folders-view').getByRole('treeitem', { name: 'src', exact: true });
  await wb.contextMenu(explorerSrc, 'Pin to Global Pinboard');

  await expect(wb.pane.getByRole('treeitem')).toHaveCount(0);
  await (await wb.titleButton('Switch to Global Scope')).click();
  await expect.poll(() => wb.labels()).toEqual(['src']);
  expect(await wb.menuItems(explorerSrc)).toContain('Unpin from Global Pinboard');

  await (await wb.titleButton('Switch to Workspace Scope')).click();
  await expect(wb.pane.getByRole('treeitem')).toHaveCount(0);
  await (await wb.titleButton('Switch to Global Scope')).click();
  await expect.poll(() => wb.labels()).toEqual(['src']);

  await wb.contextMenu(explorerSrc, 'Unpin from Global Pinboard');
  await expect(wb.pane.getByRole('treeitem')).toHaveCount(0);
});
