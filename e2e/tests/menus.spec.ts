import * as path from 'path';
import { test, expect } from '../fixtures';

test('context menus match the item type', async ({ wb, workspace }) => {
  await wb.applyPreset('e2e');

  const folder = await wb.menuItems(wb.root(path.join(workspace, 'src')));
  expect(folder).toEqual(expect.arrayContaining([
    'New File...', 'New Folder...', 'Reveal in File Manager', 'Open in Integrated Terminal', 'Find in Folder...',
    'Open in New Window', 'Move Up', 'Move Down', 'Copy Path', 'Copy Relative Path', 'Copy to…', 'Move to…',
    'Unpin Folder', 'Rename', 'Delete', 'Set Alias…',
  ]));
  expect(folder).not.toContain('Unpin File');
  expect(folder).not.toContain('Open to the Side');

  const file = await wb.menuItems(wb.root(path.join(workspace, 'notes.md')));
  expect(file).toEqual(expect.arrayContaining([
    'Reveal in File Manager', 'Open to the Side', 'Move Up', 'Move Down', 'Copy Path', 'Copy Relative Path',
    'Copy to…', 'Move to…', 'Unpin File', 'Rename', 'Delete', 'Set Alias…',
  ]));
  for (const absent of ['Unpin Folder', 'New File...', 'New Folder...', 'Open in Integrated Terminal', 'Open in New Window']) {
    expect(file).not.toContain(absent);
  }

  await wb.root(path.join(workspace, 'src')).click();
  const nestedDir = await wb.menuItems(wb.node('a'));
  expect(nestedDir).toEqual(expect.arrayContaining([
    'New File...', 'New Folder...', 'Reveal in File Manager', 'Open in Integrated Terminal', 'Find in Folder...',
    'Copy Path', 'Copy Relative Path', 'Copy to…', 'Move to…', 'Rename', 'Delete',
  ]));
  for (const absent of ['Unpin Folder', 'Unpin File', 'Move Up', 'Move Down', 'Set Alias…']) {
    expect(nestedDir).not.toContain(absent);
  }

  const nestedFile = await wb.menuItems(wb.node('f1.txt'));
  expect(nestedFile).toEqual(expect.arrayContaining([
    'Reveal in File Manager', 'Open to the Side', 'Copy Path', 'Copy Relative Path', 'Copy to…', 'Move to…', 'Rename', 'Delete',
  ]));
  for (const absent of ['New File...', 'Unpin File', 'Unpin Folder', 'Move Up', 'Set Alias…']) {
    expect(nestedFile).not.toContain(absent);
  }
});

test('the open workspace folder shows "Already Open" instead of "Open in New Window"', async ({ wb, workspace }) => {
  await wb.applyPreset('with-root');
  const active = wb.root(workspace);
  const other = wb.root(path.join(workspace, 'src'));
  await active.hover();
  await expect(active.getByRole('button', { name: 'Already Open in This Window' })).toBeVisible();
  await expect(active.getByRole('button', { name: 'Open in New Window' })).toHaveCount(0);
  await other.hover();
  await expect(other.getByRole('button', { name: 'Open in New Window' })).toBeVisible();
  expect(await wb.menuItems(active)).not.toContain('Open in New Window');
});

test('the scope button switches between workspace and global pins', async ({ wb, workspace }) => {
  await wb.applyPreset('e2e');
  await expect(wb.pane.locator('.pane-header')).toContainText('Workspace');
  await expect(await wb.titleButton('Apply Workspace Preset...')).toBeVisible();

  await (await wb.titleButton('Switch to Global Scope')).click();
  await expect(wb.pane.locator('.pane-header')).toContainText('Global');
  await expect(wb.pane.getByRole('treeitem')).toHaveCount(0);
  await expect(wb.pane).toContainText('No pinned items');
  await expect(wb.pane.getByRole('button', { name: 'Apply Workspace Preset...' })).toHaveCount(0);

  await (await wb.titleButton('Switch to Workspace Scope')).click();
  await expect.poll(() => wb.labels()).toEqual(['src', 'dest', 'other', 'notes.md']);
  expect(await wb.root(path.join(workspace, 'src')).count()).toBe(1);
});

test('the Explorer context menu pins and unpins per scope', async ({ wb, workspace }) => {
  const explorerSrc = wb.page.locator('.explorer-folders-view').getByRole('treeitem', { name: 'src', exact: true });
  await expect(explorerSrc).toBeVisible();

  let menu = await wb.menuItems(explorerSrc);
  expect(menu).toEqual(expect.arrayContaining(['Pin to Workspace Pinboard', 'Pin to Global Pinboard']));

  await wb.contextMenu(explorerSrc, 'Pin to Workspace Pinboard');
  await expect(wb.root(path.join(workspace, 'src'))).toBeVisible();
  await expect.poll(async () => await wb.menuItems(explorerSrc)).toEqual(
    expect.arrayContaining(['Unpin from Workspace Pinboard', 'Pin to Global Pinboard'])
  );
  menu = await wb.menuItems(explorerSrc);
  expect(menu).not.toContain('Pin to Workspace Pinboard');

  await wb.contextMenu(explorerSrc, 'Unpin from Workspace Pinboard');
  await expect(wb.root(path.join(workspace, 'src'))).toHaveCount(0);
  expect(await wb.menuItems(explorerSrc)).toContain('Pin to Workspace Pinboard');
});

test.describe('Restricted Mode', () => {
  test.use({ restricted: true });

  test('the panel works in an untrusted workspace', async ({ wb }) => {
    await expect(wb.page.locator('.statusbar-item', { hasText: /Restricted Mode/ })).toBeVisible();
    await wb.applyPreset('e2e');
    await expect.poll(() => wb.labels()).toEqual(['src', 'dest', 'other', 'notes.md']);
  });
});
