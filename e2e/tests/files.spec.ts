import * as fs from 'fs';
import * as path from 'path';
import { test, expect, WORKSPACE_NAME } from '../fixtures';

test.beforeEach(async ({ wb }) => {
  await wb.giveRoom(WORKSPACE_NAME);
  await wb.applyPreset('e2e');
});

test('New File, Rename and Delete work on nested items', async ({ wb, workspace }) => {
  const src = path.join(workspace, 'src');
  await wb.root(src).click();
  await expect(wb.node('f1.txt')).toBeVisible();

  await wb.contextMenu(wb.root(src), 'New File...');
  await wb.fillInput('created.txt');
  await expect(wb.node('created.txt')).toBeVisible();
  expect(fs.existsSync(path.join(src, 'created.txt'))).toBe(true);
  await expect(wb.page.getByRole('tab', { name: 'created.txt' })).toBeVisible();

  await wb.contextMenu(wb.node('f2.txt'), 'Rename');
  await wb.fillInput('renamed.txt');
  await expect(wb.node('renamed.txt')).toBeVisible();
  await expect(wb.node('f2.txt')).toHaveCount(0);
  expect(fs.existsSync(path.join(src, 'renamed.txt'))).toBe(true);

  await wb.contextMenu(wb.node('renamed.txt'), 'Delete');
  await wb.dialog('Cancel', 'Delete "renamed.txt"?');
  expect(fs.existsSync(path.join(src, 'renamed.txt'))).toBe(true);
});

test('F2 renames the selected nested item', async ({ wb, workspace }) => {
  const src = path.join(workspace, 'src');
  await wb.root(src).click();
  await wb.node('f2.txt').click();
  await wb.page.keyboard.press('F2');
  await wb.fillInput('viakey.txt');
  await expect(wb.node('viakey.txt')).toBeVisible();
  expect(fs.existsSync(path.join(src, 'viakey.txt'))).toBe(true);
  expect(fs.existsSync(path.join(src, 'f2.txt'))).toBe(false);
});

test('F2 renames a pinned root and keeps it pinned', async ({ wb, workspace }) => {
  const notes = path.join(workspace, 'notes.md');
  await wb.root(path.join(workspace, 'dest')).click();
  await wb.root(notes).click();
  await wb.page.keyboard.press('F2');
  await wb.fillInput('renamed.md');
  await expect.poll(() => fs.existsSync(path.join(workspace, 'renamed.md'))).toBe(true);
  await expect(wb.root(path.join(workspace, 'renamed.md'))).toBeVisible();
  await expect(wb.root(notes)).toHaveCount(0);
});

test('files created or removed outside VS Code show up in an expanded folder', async ({ wb, workspace }) => {
  const src = path.join(workspace, 'src');
  await wb.root(src).click();
  await expect(wb.node('f1.txt')).toBeVisible();
  fs.writeFileSync(path.join(src, 'external.txt'), 'x');
  await expect(wb.node('external.txt')).toBeVisible();
  fs.rmSync(path.join(src, 'f1.txt'));
  await expect(wb.node('f1.txt')).toHaveCount(0);
});

test('clicking a file opens it; the active editor is revealed and the selection clears off-pin', async ({ wb, workspace }) => {
  const src = path.join(workspace, 'src');
  await wb.root(src).click();
  await wb.node('f1.txt').click();
  await expect(wb.page.getByRole('tab', { name: 'f1.txt' })).toBeVisible();

  const selected = wb.pane.locator('.monaco-list-row.selected, .monaco-list-row[aria-selected="true"]');
  await expect(selected).toHaveCount(1);

  await wb.quickOpen('.pinboard.json');
  await expect(wb.page.getByRole('tab', { name: '.pinboard.json' })).toBeVisible();
  await expect(selected).toHaveCount(0);

  await wb.quickOpen('f2.txt');
  await expect(wb.page.getByRole('tab', { name: 'f2.txt' })).toBeVisible();
  await expect(selected).toHaveCount(1);
  await expect(wb.node('f2.txt')).toHaveAttribute('aria-selected', 'true');
});

test('Add File or Folder pins a folder chosen in the picker', async ({ wb, workspace }) => {
  fs.mkdirSync(path.join(workspace, 'extra'));
  await (await wb.titleButton('Add File or Folder')).click();
  await wb.chooseFolder(path.join(workspace, 'extra'));
  await expect(wb.root(path.join(workspace, 'extra'))).toBeVisible();
});
