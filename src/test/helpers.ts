import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function createMockMemento(): vscode.Memento {
  const store = new Map<string, unknown>();
  return {
    get<T>(key: string, defaultValue?: T): T {
      return store.has(key) ? (store.get(key) as T) : (defaultValue as T);
    },
    update(key: string, value: unknown): Thenable<void> {
      store.set(key, value);
      return Promise.resolve();
    },
    keys(): readonly string[] {
      return [...store.keys()];
    },
  };
}

export function createMockContext(): vscode.ExtensionContext {
  return {
    globalState: createMockMemento(),
    workspaceState: createMockMemento(),
    subscriptions: [],
  } as unknown as vscode.ExtensionContext;
}

export function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pinboard-test-'));
}

export function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}
