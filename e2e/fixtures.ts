import { test as base, _electron, ElectronApplication, expect } from '@playwright/test';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as fs from 'fs';
import * as path from 'path';
import { Workbench } from './workbench';

const REPO = path.resolve(__dirname, '..');

// Paths over ~100 chars break VS Code's IPC socket, so keep these short. Resolved because
// /tmp is a symlink on macOS and VS Code would otherwise spell paths differently from the tests.
const SHORT_TMP = fs.realpathSync('/tmp');
const WORKSPACE_NAME = 'ws';
const PINNED_VSCODE = '1.139.1';

export type Tree = { [name: string]: string | Tree };

const WORKSPACE: Tree = {
  'notes.md': '# notes\n',
  src: { 'f1.txt': 'one', 'f2.txt': 'two', a: { 'deep.txt': 'deep' } },
  dest: {},
  other: {},
};

const PRESET = {
  presets: [
    { name: 'e2e', paths: ['src', 'dest', 'other', 'notes.md'] },
    { name: 'with-root', paths: ['.', 'src', 'notes.md'] },
  ],
};

const SETTINGS = {
  // Native menus and dialogs are invisible to Playwright; these make them DOM elements.
  'window.menuStyle': 'custom',
  'window.titleBarStyle': 'custom',
  'window.dialogStyle': 'custom',
  'files.simpleDialog.enable': true,
  'explorer.confirmDragAndDrop': true,
  'workbench.startupEditor': 'none',
  'workbench.tips.enabled': false,
  'workbench.enableExperiments': false,
  'security.workspace.trust.enabled': false,
  'update.mode': 'none',
  'telemetry.telemetryLevel': 'off',
  'extensions.autoUpdate': false,
  'extensions.ignoreRecommendations': true,
  'chat.disableAIFeatures': true,
};

function writeTree(dir: string, tree: Tree): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, value] of Object.entries(tree)) {
    if (typeof value === 'string') fs.writeFileSync(path.join(dir, name), value);
    else writeTree(path.join(dir, name), value);
  }
}

export type Fixtures = {
  /** Absolute path of the throwaway workspace folder (never the repo's demo/). */
  workspace: string;
  /** Extra user settings merged over the defaults. */
  userSettings: Record<string, unknown>;
  /** Launch with Workspace Trust on and the folder untrusted (Restricted Mode). */
  restricted: boolean;
  app: ElectronApplication;
  wb: Workbench;
};

type WorkerFixtures = { vscodePath: string };

export const test = base.extend<Fixtures, WorkerFixtures>({
  vscodePath: [
    async ({}, use) => {
      const override = process.env.PB_VSCODE_PATH;
      await use(
        override ??
          (await downloadAndUnzipVSCode({
            version: process.env.PB_VSCODE_VERSION ?? PINNED_VSCODE,
            cachePath: path.join(REPO, '.vscode-test'),
          }))
      );
    },
    { scope: 'worker', timeout: 300_000 },
  ],

  userSettings: [{}, { option: true }],
  restricted: [false, { option: true }],

  workspace: async ({}, use) => {
    const root = fs.mkdtempSync(path.join(SHORT_TMP, 'pb-e2e-'));
    const ws = path.join(root, WORKSPACE_NAME);
    writeTree(ws, WORKSPACE);
    fs.writeFileSync(path.join(ws, '.pinboard.json'), JSON.stringify(PRESET));
    await use(ws);
    fs.rmSync(root, { recursive: true, force: true });
  },

  app: async ({ workspace, vscodePath, userSettings, restricted }, use, testInfo) => {
    assertBundleIsFresh();
    const root = path.dirname(workspace);
    const userData = path.join(root, 'u');
    fs.mkdirSync(path.join(userData, 'User'), { recursive: true });
    fs.writeFileSync(
      path.join(userData, 'User', 'settings.json'),
      JSON.stringify(
        {
          ...SETTINGS,
          ...(restricted
            ? { 'security.workspace.trust.enabled': true, 'security.workspace.trust.startupPrompt': 'never' }
            : {}),
          ...userSettings,
        },
        null,
        2
      )
    );
    const app = await _electron.launch({
      executablePath: vscodePath,
      args: [
        `--user-data-dir=${userData}`,
        `--extensions-dir=${path.join(root, 'e')}`,
        `--extensionDevelopmentPath=${REPO}`,
        ...(restricted ? [] : ['--disable-workspace-trust']),
        '--skip-welcome',
        '--skip-release-notes',
        '--new-window',
        workspace,
      ],
    });
    const context = app.context();
    await context.tracing.start({ screenshots: true, snapshots: true });
    await use(app);
    const failed = testInfo.status !== testInfo.expectedStatus;
    if (failed) {
      const page = await app.firstWindow();
      await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' });
    }
    await context.tracing.stop(failed ? { path: testInfo.outputPath('trace.zip') } : undefined);
    await closeOrKill(app);
  },

  wb: async ({ app }, use) => {
    const page = await app.firstWindow();
    const wb = new Workbench(page);
    await wb.ready();
    await use(wb);
  },
});

function assertBundleIsFresh(): void {
  const bundle = path.join(REPO, 'dist', 'extension.js');
  if (!fs.existsSync(bundle)) throw new Error('dist/extension.js is missing; run `npm run e2e` (it builds first).');
  const built = fs.statSync(bundle).mtimeMs;
  const newest = Math.max(
    ...fs.readdirSync(path.join(REPO, 'src')).filter(f => f.endsWith('.ts')).map(f => fs.statSync(path.join(REPO, 'src', f)).mtimeMs),
    fs.statSync(path.join(REPO, 'package.json')).mtimeMs
  );
  if (newest > built) throw new Error('dist/extension.js is older than src/ or package.json; rebuild with `node esbuild.js`.');
}

async function closeOrKill(app: ElectronApplication): Promise<void> {
  const pid = app.process().pid;
  const closed = await Promise.race([
    app.close().then(() => true, () => true),
    new Promise<boolean>(resolve => setTimeout(() => resolve(false), 15_000)),
  ]);
  if (!closed && pid) process.kill(pid, 'SIGKILL');
}

export { expect, WORKSPACE_NAME };
