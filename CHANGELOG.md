# Changelog

All notable changes to this project will be documented in this file.

## 0.0.22

- Auto-refresh the panel when files or folders are created or deleted inside a pinned directory, using OS-native file system watchers (no polling).

## 0.0.21

- Rename label style option from "Name" to "Directory Name" in the command title, status bar message, and settings descriptions for clarity.

## 0.0.20

- Add per-item aliases: right-click any pinned root item and choose **Set Alias…** to give it a custom display name. The alias replaces the default label in the panel; the underlying path is unchanged. Use **Edit Alias…** to change it or **Remove Alias** to revert.
- Add `pinboard.labelStyle` setting: display pinned root items as file/folder name (default) or as a path relative to the workspace root — useful in monorepos where multiple pinned folders share the same name. Aliases always take precedence.
- Add **Toggle Label Style (Name / Relative Path)** to the command palette to flip `labelStyle` with a status bar confirmation.
- Add **Open Workspace Config** to the command palette to open `.pinboard.json`, with an offer to create a starter file if none exists.
- Expose **Add File or Folder**, **Refresh**, scope-switch, **Apply Workspace Preset…**, and **Toggle Label Style** in the command palette under the `Pinboard:` category prefix.
- Support `{ "path": "...", "alias": "..." }` objects in `.pinboard.json` preset paths so presets can ship named aliases to teammates.

## 0.0.19

- Add first-time setup note to README about panel position.

## 0.0.18

- Document VS Code API limitations for drag-and-drop and context menu in the README.

## 0.0.16

- Update marketplace description to mention workspace presets.

## 0.0.15

- Fix "Pin to Pinboard" command palette invocation: when triggered without a URI (i.e. not from Explorer right-click), it now opens the file picker instead of silently doing nothing.

## 0.0.14

- Add workspace preset pinboards: commit a `.pinboard.json` file to your workspace root defining named presets of relative paths. A `$(list-selection)` button appears in the Pinboard title bar (workspace scope only) when presets are detected, letting users apply a preset via a QuickPick and confirmation dialog. Presets are read-only — the extension never writes to `.pinboard.json`.
- Add JSON schema for `.pinboard.json` so VS Code provides IntelliSense and validation when editing preset files.

## 0.0.13

- Add a Buy Me a Coffee support button to the README using a Marketplace-safe linked image instead of an embeddable script widget.

## 0.0.12

- Revert empty-panel context menu added in 0.0.11 — VS Code does not support context menus on empty tree view space ([upstream issue #188259](https://github.com/microsoft/vscode/issues/188259)).

## 0.0.10

- Fix `alreadyOpen` command not appearing in the tree: active (currently open) folders now show the window indicator icon inline instead of the "Open in New Window" button.
- Fix `renamePinnedItem` and `rename` ignoring leading/trailing whitespace in the new name.
- Fix disposable leak: `onDidChangeTreeData` listener is now properly tracked in `context.subscriptions`.
- Await all `storage.update()` calls so pin state is never silently lost on quick shutdown.
- Add error notifications for failed file system operations (rename, delete, create).
- Reuse existing terminal instances in "Open in Integrated Terminal" instead of always creating a new one.
- Switch tree rendering (`getChildren`) to async I/O so the extension host event loop is not blocked.
- Fix redundant no-op ternary in `openToSide`.
- Update "Reveal in Finder" command title to "Reveal in File Manager" for cross-platform correctness.
- Fix configuration descriptions that incorrectly said "folders" when files are also supported.

## 0.0.9

- Add the Open VSX install link to the README marketplace section.
- Remove the README development section in favor of the repo-specific guidance in `AGENTS.md`.

## 0.0.8

- Change the package license metadata to SPDX `MIT`.
- Document the Open VSX publishing flow alongside the VS Code Marketplace release process.

## 0.0.5

- Refresh the Marketplace icon from a newly cropped source image for better framing and readability.

## 0.0.4

- Tighten the Marketplace icon crop so the pin/folder mark reads clearly at small sizes.
- Increase the published icon asset to `512x512` for better detail retention.

## 0.0.3

- Expand Marketplace search metadata with broader navigation and bookmarking keywords.
- Add Marketplace banner metadata and other listing polish in `package.json`.
- Add a small `demo/` workspace for screenshots and manual demos without shipping it in the VSIX.

## 0.0.2

- Optimize the published extension icon by switching to a square `256x256` asset generated with macOS `sips`.
- Add Marketplace badges and a direct install link to the README.
- Tighten the VSIX contents by excluding the larger source logo from the published package.

## 0.0.1

- Initial Marketplace release.
- Add a Pinboard view in the Explorer sidebar for persistent pinned files and folders.
- Support global and workspace pin scopes.
- Support drag-and-drop and command-based reordering for pinned roots.
- Include inline actions for unpinning, moving items, and opening pinned folders in a new window.
