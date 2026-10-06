import { expect, Locator, Page } from '@playwright/test';

export class Workbench {
  readonly pane: Locator;

  constructor(readonly page: Page) {
    this.pane = page.locator('.pane', { has: page.locator('.pane-header', { hasText: /^Pinboard/ }) });
  }

  async ready(): Promise<void> {
    await this.page.locator('.monaco-workbench').waitFor();
    const header = this.pane.locator('.pane-header');
    await header.waitFor();
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  }

  // The panel is short next to the Explorer's file tree; collapse that so rows stay in view.
  async giveRoom(workspaceName: string): Promise<void> {
    const header = this.page.locator('.pane-header', { hasText: new RegExp(`^${workspaceName}$`) });
    if ((await header.getAttribute('aria-expanded')) === 'true') await header.click();
    await this.settled(this.pane);
  }

  // A pinned root's accessible name is its tooltip (the full path), whatever its visible label is.
  root(absPath: string): Locator {
    return this.item(absPath);
  }

  node(name: string): Locator {
    return this.item(name);
  }

  // Rows with inline buttons get a ", has actions" suffix on their accessible name.
  item(name: string): Locator {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.pane.getByRole('treeitem', { name: new RegExp(`^${escaped}(, has actions)?$`) });
  }

  // Visible row text, in tree order (expanded folders include their children).
  async labels(): Promise<string[]> {
    return this.pane
      .getByRole('treeitem')
      .evaluateAll(els => els.map(e => (e.querySelector('.label-name')?.textContent ?? '').trim()));
  }

  async runCommand(title: string): Promise<void> {
    await this.page.keyboard.press('F1');
    const input = this.page.locator('.quick-input-box input');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await input.fill(`>${title}`);
    await expect(this.page.locator('.quick-input-list .monaco-list-row').first()).toContainText(title);
    await this.page.keyboard.press('Enter');
  }

  async pick(label: string): Promise<void> {
    const entry = this.page.locator('.quick-input-list .monaco-list-row', { hasText: label }).first();
    await expect(entry).toBeVisible();
    await entry.click();
  }

  async pickOptions(): Promise<string[]> {
    const rows = this.page.locator('.quick-input-list .monaco-list-row');
    await expect(rows.first()).toBeVisible();
    return (await rows.allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  }

  // A negative assertion ("nothing popped up") is only meaningful once a wrong reaction would have shown.
  async settleNegative(): Promise<void> {
    await this.page.waitForTimeout(1000);
  }

  async escape(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  async dialogText(): Promise<string> {
    const row = this.page.locator('.monaco-dialog-box .dialog-message-row');
    await expect(row).toBeVisible();
    return (await row.innerText()).replace(/\s+/g, ' ').trim();
  }

  // `chained` is for a button that leads straight into another dialog, which never lets this one be seen closed.
  async dialog(button: string, message?: string | RegExp, chained = false): Promise<void> {
    const dialog = this.page.locator('.monaco-dialog-box');
    await expect(dialog).toBeVisible();
    if (message) await expect(dialog.locator('.dialog-message-row')).toContainText(message);
    await dialog.getByRole('button', { name: button, exact: true }).click();
    if (!chained) await expect(dialog).toBeHidden();
  }

  async noDialog(): Promise<void> {
    await expect(this.page.locator('.monaco-dialog-box')).toHaveCount(0);
  }

  async openMenu(target: Locator): Promise<string[]> {
    await target.click({ button: 'right' });
    const labels = this.page.locator('.monaco-menu .action-item .action-label');
    await expect(labels.first()).toBeVisible();
    return (await labels.allInnerTexts()).map(t => t.trim()).filter(Boolean);
  }

  async menuItems(target: Locator): Promise<string[]> {
    const items = await this.openMenu(target);
    await this.escape();
    await expect(this.page.locator('.monaco-menu')).toHaveCount(0);
    return items;
  }

  async contextMenu(target: Locator, item: string): Promise<void> {
    await this.openMenu(target);
    const entry = this.page
      .locator('.monaco-menu .action-item')
      .filter({ has: this.page.locator('.action-label', { hasText: new RegExp(`^${escapeRegExp(item)}$`) }) });
    await entry.hover();
    await entry.click({ delay: 80 });
  }

  // Dragging while the tree is still animating or re-rendering silently does nothing.
  async drag(source: Locator, target: Locator): Promise<void> {
    await this.settled(source);
    await this.settled(target);
    await source.dragTo(target, { steps: 10 });
  }

  // Drops onto the blank area at the bottom of the panel, where VS Code reports no target element.
  async dragToEmptySpace(source: Locator): Promise<void> {
    const list = this.pane.locator('.monaco-list');
    await this.settled(source);
    await this.settled(list);
    const box = await list.boundingBox();
    if (!box) throw new Error('the Pinboard list is not visible');
    await source.dragTo(list, { steps: 10, targetPosition: { x: box.width / 2, y: box.height - 8 } });
  }

  private async settled(locator: Locator): Promise<void> {
    let last = '';
    await expect
      .poll(async () => {
        const now = JSON.stringify(await locator.boundingBox());
        const stable = now === last;
        last = now;
        return stable;
      }, { intervals: [250] })
      .toBe(true);
  }

  async applyPreset(name: string): Promise<void> {
    await this.runCommand('Pinboard: Apply Workspace Preset...');
    await this.pick(name);
    await this.dialog('Apply', `Applying preset "${name}"`);
    await expect(this.pane.getByRole('treeitem').first()).toBeVisible();
  }

  async toggleSort(): Promise<void> {
    await this.runCommand('Pinboard: Toggle Sort (Manual / Alphabetical)');
  }

  // files.simpleDialog.enable makes the native folder picker a path box inside VS Code.
  async chooseFolder(absPath: string): Promise<void> {
    const input = this.page.locator('.quick-input-box input');
    await expect(input).toBeVisible();
    await input.fill(absPath.endsWith('/') ? absPath : absPath + '/');
    await this.page.keyboard.press('Enter');
  }

  async chooseFile(absPath: string): Promise<void> {
    const input = this.page.locator('.quick-input-box input');
    await expect(input).toBeVisible();
    await input.fill(absPath);
    await this.page.keyboard.press('Enter');
  }

  async fillInput(value: string): Promise<void> {
    const input = this.page.locator('.quick-input-box input');
    await expect(input).toBeVisible();
    await input.fill(value);
    await this.page.keyboard.press('Enter');
  }

  async titleButton(name: string): Promise<Locator> {
    const button = this.pane.getByRole('button', { name, exact: true });
    await this.pane.locator('.pane-header').hover();
    return button;
  }

  async reload(): Promise<void> {
    await this.page.evaluate(() => { (window as unknown as { __pbBeforeReload: boolean }).__pbBeforeReload = true; });
    await this.runCommand('Developer: Reload Window');
    await this.page.waitForFunction(() => !(window as unknown as { __pbBeforeReload?: boolean }).__pbBeforeReload);
    await this.ready();
  }

  async quickOpen(fileName: string): Promise<void> {
    await this.page.keyboard.press('ControlOrMeta+P');
    const input = this.page.locator('.quick-input-box input');
    await expect(input).toBeFocused();
    await input.fill(fileName);
    await expect(this.page.locator('.quick-input-list .monaco-list-row').first()).toContainText(fileName);
    await this.page.keyboard.press('Enter');
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
