# Pinboard

![Pinboard demo](assets/demo.png)

A VS Code extension that adds a **Pinboard** panel inside the Explorer sidebar. Pin any file or folder on disk as a persistent shortcut - independent of your current workspace.

Install from:

- Visual Studio Marketplace: https://marketplace.visualstudio.com/items?itemName=daanrosendal.pinboard
- Open VSX Registry: https://open-vsx.org/extension/daanrosendal/pinboard

Support development:

<a href="https://buymeacoffee.com/daanrosendal"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" width="180"></a>

---

## Features

### Pin files and folders

Click **+** in the panel header to pick any file or folder, or right-click any item in the Explorer file tree and choose **Pin to Pinboard**.

### Two persistence scopes

Toggle between **Global** (pins survive across all workspaces) and **Workspace** (pins are local to the current workspace) using the scope button in the panel header. Also configurable via `Settings > Pinboard > Scope`.

### Drag to reorder

Drag pinned items to rearrange them. Order is persisted.

> **Note:** VS Code does not expose its internal file drag-and-drop API to extensions, so dragging files between folders to move them is not supported. Drag is limited to reordering pinned root items.

### Workspace presets

This is, for instance, useful in large monorepos. Commit a `.pinboard.json` file to the workspace root to define named pinboard presets, then teammates switch to **Workspace** scope and click the list selection button in the panel header to open the menu for choosing a preset - letting them replace their current workspace pins with the preset's paths in one step.

```json
{
  "presets": [
    {
      "name": "Frontend Team",
      "paths": ["packages/frontend/src", "packages/shared", "docs/frontend"]
    },
    {
      "name": "Backend Team",
      "paths": ["packages/backend", "packages/api", "packages/shared"]
    }
  ]
}
```

All paths are relative to the workspace root. Paths that don't exist on disk are silently ignored. The extension never modifies `.pinboard.json`.

### Context menu

Right-click any item for contextual actions:

> **Note:** VS Code does not expose its internal Explorer context menu API to extensions, so this menu is built independently. It covers the most common file operations but is not identical to the native Explorer context menu.

| Item type     | Actions                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pinned folder | New File, New Folder, Reveal in Finder, Open in Terminal, Find in Folder, Move Up, Move Down, Open in New Window, Copy Path, Copy Relative Path, Rename, Delete, Unpin Folder |
| Pinned file   | Open to the Side, Move Up, Move Down, Copy Path, Copy Relative Path, Reveal in Finder, Rename, Delete, Unpin File                                                             |
| Subfolder     | New File, New Folder, Reveal in Finder, Open in Terminal, Find in Folder, Copy Path, Copy Relative Path, Rename, Delete                                                       |
| Nested file   | Open to the Side, Reveal in Finder, Copy Path, Copy Relative Path, Rename, Delete                                                                                             |

---

## Usage

| Action             | How                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Pin a folder       | Click `+` in the panel header, or right-click a folder in Explorer and choose **Pin to Pinboard** |
| Pin a file         | Click `+` in the panel header, or right-click a file in Explorer and choose **Pin to Pinboard**   |
| Unpin a folder     | Hover a pinned folder and click **Unpin Folder**, or right-click it and choose **Unpin Folder**   |
| Unpin a file       | Hover a pinned file and click **Unpin File**, or right-click it and choose **Unpin File**         |
| Open in new window | Hover a pinned folder and click **Open in New Window**, or right-click it and choose that action  |
| Toggle scope       | Click the scope button in the panel header to switch between **Global** and **Workspace**         |
| Reorder            | Drag a pinned item, or right-click it and choose **Move Up** or **Move Down**                     |
| Apply a preset     | Switch to **Workspace** scope, then click the preset button in the panel header                   |

---

## Extension Settings

| Setting          | Default    | Description                                                                                                |
| ---------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| `pinboard.scope` | `"global"` | `"global"` - pins persist across all workspaces. `"workspace"` - pins are scoped to the current workspace. |
