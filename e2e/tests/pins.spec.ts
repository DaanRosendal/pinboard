import * as path from 'path';
import { test, expect } from '../fixtures';

const PRESET_ORDER = ['src', 'dest', 'other', 'notes.md'];

test('applying the workspace preset pins the configured items in order', async ({ wb }) => {
  await wb.applyPreset('e2e');
  await expect.poll(() => wb.labels()).toEqual(PRESET_ORDER);
});

test('unpinning a folder and a file root removes them, and the change survives a reload', async ({ wb, workspace }) => {
  await wb.applyPreset('e2e');
  await wb.contextMenu(wb.root(path.join(workspace, 'other')), 'Unpin Folder');
  await wb.contextMenu(wb.root(path.join(workspace, 'notes.md')), 'Unpin File');
  await expect.poll(() => wb.labels()).toEqual(['src', 'dest']);
  await wb.reload();
  await expect.poll(() => wb.labels()).toEqual(['src', 'dest']);
});

test('alias lifecycle: set, edit/remove menu states, remove, cancel', async ({ wb, workspace }) => {
  await wb.applyPreset('e2e');
  const src = wb.root(path.join(workspace, 'src'));
  expect(await wb.menuItems(src)).toContain('Set Alias…');

  await wb.contextMenu(src, 'Set Alias…');
  await wb.fillInput('Sources');
  await expect.poll(() => wb.labels()).toEqual(['Sources', 'dest', 'other', 'notes.md']);
  const aliased = await wb.menuItems(src);
  expect(aliased).toEqual(expect.arrayContaining(['Edit Alias…', 'Remove Alias']));
  expect(aliased).not.toContain('Set Alias…');

  await wb.contextMenu(src, 'Edit Alias…');
  await wb.escape();
  await expect.poll(() => wb.labels()).toEqual(['Sources', 'dest', 'other', 'notes.md']);

  await wb.contextMenu(src, 'Remove Alias');
  await expect.poll(() => wb.labels()).toEqual(PRESET_ORDER);
  expect(await wb.menuItems(src)).toContain('Set Alias…');
});

test('sort orders by the displayed label, hides Move Up/Down, and manual order comes back', async ({ wb, workspace }) => {
  await wb.applyPreset('e2e');
  const src = wb.root(path.join(workspace, 'src'));
  await wb.contextMenu(src, 'Set Alias…');
  await wb.fillInput('Zeta');
  await expect.poll(() => wb.labels()).toEqual(['Zeta', 'dest', 'other', 'notes.md']);

  await wb.toggleSort();
  await expect.poll(() => wb.labels()).toEqual(['dest', 'notes.md', 'other', 'Zeta']);
  const sorted = await wb.menuItems(wb.root(path.join(workspace, 'dest')));
  expect(sorted).not.toContain('Move Up');
  expect(sorted).not.toContain('Move Down');

  await wb.toggleSort();
  await expect.poll(() => wb.labels()).toEqual(['Zeta', 'dest', 'other', 'notes.md']);
  const manual = await wb.menuItems(wb.root(path.join(workspace, 'dest')));
  expect(manual).toEqual(expect.arrayContaining(['Move Up', 'Move Down']));
});

test('Move Up and Move Down reorder the pins', async ({ wb, workspace }) => {
  await wb.applyPreset('e2e');
  await wb.contextMenu(wb.root(path.join(workspace, 'other')), 'Move Up');
  await expect.poll(() => wb.labels()).toEqual(['src', 'other', 'dest', 'notes.md']);
  await wb.contextMenu(wb.root(path.join(workspace, 'src')), 'Move Down');
  await expect.poll(() => wb.labels()).toEqual(['other', 'src', 'dest', 'notes.md']);
});

test.describe('dropOnPinnedFolder = reorder', () => {
  test.use({ userSettings: { 'pinboard.dropOnPinnedFolder': 'reorder' } });

  test('dropping a pin on a pinned folder reorders it without touching the disk', async ({ wb, workspace }) => {
    await wb.applyPreset('e2e');
    await wb.drag(wb.root(path.join(workspace, 'other')), wb.root(path.join(workspace, 'src')));
    await expect.poll(() => wb.labels()).toEqual(['other', 'src', 'dest', 'notes.md']);
    await wb.noDialog();
  });
});

test('dragging a pin is disabled while sorted', async ({ wb, workspace }) => {
  await wb.applyPreset('e2e');
  await wb.toggleSort();
  await expect.poll(() => wb.labels()).toEqual(['dest', 'notes.md', 'other', 'src']);
  await wb.drag(wb.root(path.join(workspace, 'src')), wb.root(path.join(workspace, 'dest')));
  await wb.settleNegative();
  await expect(wb.page.locator('.quick-input-widget')).toBeHidden();
  await expect.poll(() => wb.labels()).toEqual(['dest', 'notes.md', 'other', 'src']);
});
