import * as fs from 'fs';
import * as path from 'path';
import { test, expect, WORKSPACE_NAME } from '../fixtures';
import { Workbench } from '../workbench';

test.beforeEach(async ({ wb }) => {
  await wb.giveRoom(WORKSPACE_NAME);
  await wb.applyPreset('e2e');
});

function makeChain(workspace: string): { other: string; deepest: string } {
  const other = path.join(workspace, 'other');
  const deepest = path.join(other, 'x', 'y', 'z');
  fs.mkdirSync(deepest, { recursive: true });
  fs.writeFileSync(path.join(deepest, 'leaf.txt'), 'leaf');
  return { other, deepest };
}

function selectedRows(wb: Workbench) {
  return wb.pane.locator('.monaco-list-row.selected, .monaco-list-row[aria-selected="true"]');
}

test('a chain of single-folder folders is one row, addressed by its last folder', async ({ wb, workspace }) => {
  const { other, deepest } = makeChain(workspace);
  await wb.root(other).click();
  await expect(wb.root(deepest)).toBeVisible();
  expect(await wb.labels()).toEqual(['src', 'dest', 'other', 'x/y/z', 'notes.md']);

  await wb.root(deepest).click();
  await expect(wb.node('leaf.txt')).toBeVisible();
  expect(await wb.labels()).toEqual(['src', 'dest', 'other', 'x/y/z', 'leaf.txt', 'notes.md']);
});

test('a folder with several entries ends the chain', async ({ wb, workspace }) => {
  const { other } = makeChain(workspace);
  fs.writeFileSync(path.join(other, 'x', 'y', 'sibling.txt'), 'x');
  await wb.root(other).click();
  await expect.poll(() => wb.labels()).toEqual(['src', 'dest', 'other', 'x/y', 'notes.md']);
});

test('the context menu of a merged row is the folder menu, and New File lands in the last folder', async ({ wb, workspace }) => {
  const { other, deepest } = makeChain(workspace);
  await wb.root(other).click();
  await expect(wb.root(deepest)).toBeVisible();

  const items = await wb.menuItems(wb.root(deepest));
  for (const entry of ['New File...', 'New Folder...', 'Rename', 'Delete', 'Move to…', 'Copy to…']) {
    expect(items).toContain(entry);
  }

  await wb.contextMenu(wb.root(deepest), 'New File...');
  await wb.fillInput('created.txt');
  await expect.poll(() => fs.existsSync(path.join(deepest, 'created.txt'))).toBe(true);
});

test('Rename on a merged row renames its last folder only', async ({ wb, workspace }) => {
  const { other, deepest } = makeChain(workspace);
  await wb.root(other).click();
  await wb.contextMenu(wb.root(deepest), 'Rename');
  await wb.fillInput('w');
  await expect.poll(() => fs.existsSync(path.join(other, 'x', 'y', 'w', 'leaf.txt'))).toBe(true);
  expect(fs.existsSync(path.join(other, 'x', 'y'))).toBe(true);
  await expect.poll(() => wb.labels()).toContain('x/y/w');
});

test('F2 on a merged row renames its last folder only', async ({ wb, workspace }) => {
  const { other, deepest } = makeChain(workspace);
  await wb.root(other).click();
  await wb.root(deepest).click();
  await wb.page.keyboard.press('F2');
  await wb.fillInput('w');
  await expect.poll(() => fs.existsSync(path.join(other, 'x', 'y', 'w', 'leaf.txt'))).toBe(true);
  expect(fs.existsSync(path.join(other, 'x', 'y'))).toBe(true);
});

test('opening a file inside a collapsed chain reveals it in the merged row', async ({ wb, workspace }) => {
  const { other, deepest } = makeChain(workspace);
  await expect(wb.root(other)).toBeVisible();
  await expect(wb.node('x/y/z')).toHaveCount(0);

  await wb.quickOpen('leaf.txt');
  await expect(wb.page.getByRole('tab', { name: 'leaf.txt' })).toBeVisible();

  await expect(wb.root(deepest)).toBeVisible();
  await expect(wb.node('leaf.txt')).toHaveAttribute('aria-selected', 'true');
  await expect(selectedRows(wb)).toHaveCount(1);

  await wb.quickOpen('.pinboard.json');
  await expect(wb.page.getByRole('tab', { name: '.pinboard.json' })).toBeVisible();
  await expect(selectedRows(wb)).toHaveCount(0);

  await wb.quickOpen('leaf.txt');
  await expect(wb.node('leaf.txt')).toHaveAttribute('aria-selected', 'true');
});

test('dragging a file out of a merged row moves it, and the emptied chain stays one row', async ({ wb, workspace }) => {
  const { other, deepest } = makeChain(workspace);
  await wb.root(other).click();
  await wb.root(deepest).click();
  await expect(wb.node('leaf.txt')).toBeVisible();

  await wb.drag(wb.node('leaf.txt'), wb.root(path.join(workspace, 'dest')));
  await wb.dialog('Move', 'Move "leaf.txt" into "dest"?');
  await expect.poll(() => fs.existsSync(path.join(workspace, 'dest', 'leaf.txt'))).toBe(true);
  expect(fs.existsSync(deepest)).toBe(true);
  await expect.poll(() => wb.labels()).toContain('x/y/z');
});

test('dropping a file on a merged row moves it into the last folder', async ({ wb, workspace }) => {
  const { other, deepest } = makeChain(workspace);
  const dest = path.join(workspace, 'dest');
  fs.writeFileSync(path.join(dest, 'moveme.txt'), 'x');
  await wb.root(dest).click();
  await expect(wb.node('moveme.txt')).toBeVisible();
  await wb.root(other).click();
  await expect(wb.root(deepest)).toBeVisible();

  await wb.drag(wb.node('moveme.txt'), wb.root(deepest));
  await wb.dialog('Move', 'Move "moveme.txt" into "z"?');
  await expect.poll(() => fs.existsSync(path.join(deepest, 'moveme.txt'))).toBe(true);
  expect(fs.existsSync(path.join(dest, 'moveme.txt'))).toBe(false);
});

test('dragging a merged row moves only its last folder', async ({ wb, workspace }) => {
  const { other, deepest } = makeChain(workspace);
  const dest = path.join(workspace, 'dest');
  await wb.root(other).click();
  await expect(wb.root(deepest)).toBeVisible();

  await wb.drag(wb.root(deepest), wb.root(dest));
  await wb.dialog('Move', 'Move "z" into "dest"?');
  await expect.poll(() => fs.existsSync(path.join(dest, 'z', 'leaf.txt'))).toBe(true);
  expect(fs.existsSync(path.join(other, 'x', 'y'))).toBe(true);
  await expect.poll(() => wb.labels()).toContain('x/y');
});

test('the row splits and merges as files change outside VS Code', async ({ wb, workspace }) => {
  const { other } = makeChain(workspace);
  await wb.root(other).click();
  await expect.poll(() => wb.labels()).toEqual(['src', 'dest', 'other', 'x/y/z', 'notes.md']);

  const sibling = path.join(other, 'x', 'y', 'sibling.txt');
  fs.writeFileSync(sibling, 'x');
  await expect.poll(() => wb.labels()).toEqual(['src', 'dest', 'other', 'x/y', 'notes.md']);

  fs.rmSync(sibling);
  await expect.poll(() => wb.labels()).toEqual(['src', 'dest', 'other', 'x/y/z', 'notes.md']);
});

test('hidden VCS and OS entries do not stop a chain', async ({ wb, workspace }) => {
  const { other } = makeChain(workspace);
  fs.mkdirSync(path.join(other, 'x', '.git'));
  fs.writeFileSync(path.join(other, 'x', '.DS_Store'), '');
  await wb.root(other).click();
  await expect.poll(() => wb.labels()).toEqual(['src', 'dest', 'other', 'x/y/z', 'notes.md']);
});

test('changing pinboard.compactFolders in settings updates the open tree', async ({ wb, workspace }) => {
  const { other } = makeChain(workspace);
  const settingsFile = path.join(path.dirname(workspace), 'u', 'User', 'settings.json');
  const setCompact = (value: boolean) => {
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    settings['pinboard.compactFolders'] = value;
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  };

  await wb.root(other).click();
  await expect.poll(() => wb.labels()).toEqual(['src', 'dest', 'other', 'x/y/z', 'notes.md']);

  setCompact(false);
  await expect.poll(() => wb.labels()).toEqual(['src', 'dest', 'other', 'x', 'notes.md']);

  setCompact(true);
  await expect.poll(() => wb.labels()).toEqual(['src', 'dest', 'other', 'x/y/z', 'notes.md']);
});

test.describe('pinboard.compactFolders = false', () => {
  test.use({ userSettings: { 'pinboard.compactFolders': false } });

  test('every folder keeps its own row', async ({ wb, workspace }) => {
    const { other } = makeChain(workspace);
    await wb.root(other).click();
    await expect.poll(() => wb.labels()).toEqual(['src', 'dest', 'other', 'x', 'notes.md']);
    await wb.node('x').click();
    await expect.poll(() => wb.labels()).toEqual(['src', 'dest', 'other', 'x', 'y', 'notes.md']);
  });
});
