# Changelog

All notable changes to this project will be documented in this file.

## 0.0.11

- Add context menu when right-clicking empty space in the Pinboard panel, exposing the global controls: scope toggle (Global ↔ Workspace), Add File or Folder, Refresh, and Collapse All.

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
