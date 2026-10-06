import * as fs from 'fs';
import * as path from 'path';
import { test, expect, WORKSPACE_NAME } from '../fixtures';
import { Workbench } from '../workbench';

test.beforeEach(async ({ wb }) => {
  await wb.giveRoom(WORKSPACE_NAME);
  await wb.applyPreset('e2e');
});

async function expand(wb: Workbench, absPath: string, child: string): Promise<void> {
  await wb.root(absPath).click();
  await expect(wb.node(child)).toBeVisible();
}

test('dragging a file onto a pinned folder asks first; cancel keeps it, confirm moves it', async ({ wb, workspace }) => {
  const dest = path.join(workspace, 'dest');
  await expand(wb, path.join(workspace, 'src'), 'f1.txt');

  await wb.drag(wb.node('f1.txt'), wb.root(dest));
  await wb.dialog('Cancel', 'Move "f1.txt" into "dest"?');
  await wb.settleNegative();
  expect(fs.existsSync(path.join(workspace, 'src', 'f1.txt'))).toBe(true);
  expect(fs.readdirSync(dest)).toEqual([]);

  await wb.drag(wb.node('f1.txt'), wb.root(dest));
  await wb.dialog('Move', 'Move "f1.txt" into "dest"?');
  await expect.poll(() => fs.existsSync(path.join(dest, 'f1.txt'))).toBe(true);
  expect(fs.existsSync(path.join(workspace, 'src', 'f1.txt'))).toBe(false);

  await expect(wb.node('f1.txt')).toHaveCount(0);
  await wb.root(dest).click();
  await expect(wb.node('f1.txt')).toBeVisible();
  expect(await wb.labels()).toEqual(['src', 'a', 'f2.txt', 'dest', 'f1.txt', 'other', 'notes.md']);
});

test.describe('explorer.confirmDragAndDrop = false', () => {
  test.use({ userSettings: { 'explorer.confirmDragAndDrop': false } });

  test('dragging a file moves it without asking', async ({ wb, workspace }) => {
    await expand(wb, path.join(workspace, 'src'), 'f1.txt');
    await wb.drag(wb.node('f1.txt'), wb.root(path.join(workspace, 'dest')));
    await expect.poll(() => fs.existsSync(path.join(workspace, 'dest', 'f1.txt'))).toBe(true);
    await wb.noDialog();
  });
});

test('Move to… moves a nested folder and the tree follows', async ({ wb, workspace }) => {
  await expand(wb, path.join(workspace, 'src'), 'a');
  await wb.contextMenu(wb.node('a'), 'Move to…');
  await wb.chooseFolder(path.join(workspace, 'dest'));
  await expect.poll(() => fs.existsSync(path.join(workspace, 'dest', 'a', 'deep.txt'))).toBe(true);
  expect(fs.existsSync(path.join(workspace, 'src', 'a'))).toBe(false);
  await expect(wb.node('a')).toHaveCount(0);
  await wb.root(path.join(workspace, 'dest')).click();
  await expect(wb.node('a')).toBeVisible();
});

test('Copy to… copies a folder, keeps the original, and shows both', async ({ wb, workspace }) => {
  await expand(wb, path.join(workspace, 'src'), 'a');
  await wb.contextMenu(wb.node('a'), 'Copy to…');
  await wb.chooseFolder(path.join(workspace, 'other'));
  await expect.poll(() => fs.existsSync(path.join(workspace, 'other', 'a', 'deep.txt'))).toBe(true);
  expect(fs.existsSync(path.join(workspace, 'src', 'a', 'deep.txt'))).toBe(true);
  await expect(wb.node('a')).toHaveCount(1);
  await wb.root(path.join(workspace, 'other')).click();
  await expect(wb.node('a')).toHaveCount(2);
});

test('Move to… on a pinned root keeps the pin pointing at the moved folder', async ({ wb, workspace }) => {
  await wb.contextMenu(wb.root(path.join(workspace, 'other')), 'Move to…');
  await wb.chooseFolder(path.join(workspace, 'dest'));
  await expect(wb.root(path.join(workspace, 'dest', 'other'))).toBeVisible();
  await expect(wb.root(path.join(workspace, 'other'))).toHaveCount(0);
  expect(fs.existsSync(path.join(workspace, 'dest', 'other'))).toBe(true);
});

test('dropping a pin on a pinned folder offers reorder or move; Move into keeps the pin', async ({ wb, workspace }) => {
  const other = path.join(workspace, 'other');
  await wb.drag(wb.root(other), wb.root(path.join(workspace, 'dest')));
  const options = await wb.pickOptions();
  expect(options).toEqual(['Reorder before "dest"', 'Move into "dest"']);
  await wb.pick('Move into');

  await expect(wb.root(path.join(workspace, 'dest', 'other'))).toBeVisible();
  await expect(wb.root(other)).toHaveCount(0);
  expect(fs.existsSync(path.join(workspace, 'dest', 'other'))).toBe(true);
  expect(fs.existsSync(other)).toBe(false);

  await wb.reload();
  await expect(wb.root(path.join(workspace, 'dest', 'other'))).toBeVisible();
});

test('dropping a pin on a pinned folder and choosing Reorder only reorders', async ({ wb, workspace }) => {
  await wb.drag(wb.root(path.join(workspace, 'other')), wb.root(path.join(workspace, 'src')));
  await wb.pick('Reorder before');
  await expect.poll(() => wb.labels()).toEqual(['other', 'src', 'dest', 'notes.md']);
  expect(fs.existsSync(path.join(workspace, 'other'))).toBe(true);
});

test('dropping a file on empty space offers the workspace root or another folder', async ({ wb, workspace }) => {
  fs.writeFileSync(path.join(workspace, 'dest', 'moveme.txt'), 'x');
  await wb.root(path.join(workspace, 'dest')).click();
  await expect(wb.node('moveme.txt')).toBeVisible();

  await wb.dragToEmptySpace(wb.node('moveme.txt'));
  const options = await wb.pickOptions();
  expect(options).toEqual([`Move to workspace root "${WORKSPACE_NAME}"`, 'Move to another folder…']);
  await wb.pick('Move to workspace root');
  await expect.poll(() => fs.existsSync(path.join(workspace, 'moveme.txt'))).toBe(true);
  expect(fs.existsSync(path.join(workspace, 'dest', 'moveme.txt'))).toBe(false);
});

test('moving onto a same-named item asks to replace and mentions the Trash', async ({ wb, workspace }) => {
  fs.writeFileSync(path.join(workspace, 'dest', 'f1.txt'), 'existing');
  await expand(wb, path.join(workspace, 'src'), 'f1.txt');
  await wb.drag(wb.node('f1.txt'), wb.root(path.join(workspace, 'dest')));
  await wb.dialog('Move', 'Move "f1.txt" into "dest"?', true);

  const text = await wb.dialogText();
  expect(text).toContain('"f1.txt" already exists in "dest". Replace it?');
  expect(text).toContain('The existing item will be moved to the Trash.');
  await wb.dialog('Cancel');
  expect(fs.readFileSync(path.join(workspace, 'dest', 'f1.txt'), 'utf8')).toBe('existing');
  expect(fs.existsSync(path.join(workspace, 'src', 'f1.txt'))).toBe(true);
});
