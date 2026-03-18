# Pinboard

<img src="assets/demo.png" width="600" />

A VS Code extension that adds a **Pinboard** panel inside the Explorer sidebar. Pin any file or folder on disk as a persistent shortcut - independent of your current workspace.

> **First-time setup:** Once installed, the Pinboard panel appears at the bottom of the Explorer sidebar. Drag it to the top if you'd prefer it there. VS Code doesn't allow extensions to control their panel position on install.

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

### Aliases

Right-click any pinned root item and choose **Set Alias…** to give it a custom display name. The alias replaces the default label in the panel; the underlying path is unchanged. Clear the alias to revert.

### Label style

Configure `Settings > Pinboard > Label Style` to display pinned root items as the file/folder name (default) or as a path relative to the workspace root — useful in monorepos where multiple pinned folders share the same name. Aliases always take precedence over this setting.

### Workspace presets

This is, for instance, useful in large monorepos. Commit a `.pinboard.json` file to the workspace root to define named pinboard presets, then teammates switch to **Workspace** scope and click the list selection button in the panel header to open the menu for choosing a preset - letting them replace their current workspace pins with the preset's paths in one step.

```json
{
  "presets": [
    {
      "name": "Full Stack",
      "paths": [
        "apps/web/src",
        "services/api-gateway/src",
        "services/auth-service/src",
        "packages/shared/src",
        "packages/db/src"
      ]
    },
    {
      "name": "Backend On-Call",
      "paths": [
        "infra/k8s",
        "docs/runbooks",
        { "path": "services/api-gateway", "alias": "API Gateway" },
        { "path": "services/auth-service", "alias": "Auth" },
        { "path": "services/billing-service", "alias": "Billing" },
        { "path": "services/notification-service", "alias": "Notifications" }
      ]
    },
    {
      "name": "Platform Eng",
      "paths": [
        { "path": "packages/db", "alias": "Database Layer" },
        { "path": "packages/config", "alias": "Shared Config" },
        { "path": "infra/terraform", "alias": "Terraform" },
        { "path": "tools/codegen", "alias": "Codegen" },
        { "path": "e2e", "alias": "E2E Tests" },
        { "path": ".github/workflows", "alias": "CI/CD" }
      ]
    }
  ]
}
```

All paths are relative to the workspace root. Paths that don't exist on disk are silently ignored. The extension never modifies `.pinboard.json`.

### Auto-reveal active file

When you switch between editor tabs, the Pinboard tree automatically highlights the active file — if it falls under a pinned folder or is a pinned file itself. This makes it easy to keep track of where you are relative to your pinned items. When the active file is not under any pin, the previous selection is cleared so the tree never shows a stale highlight.

Controlled by the `pinboard.autoReveal` setting (enabled by default).

### Auto-refresh

The panel updates automatically when files or folders are created or deleted inside a pinned directory — no manual refresh needed.

### Context menu

Right-click any item for contextual actions:

> **Note:** VS Code does not expose its internal Explorer context menu API to extensions, so this menu is built independently. It covers the most common file operations but is not identical to the native Explorer context menu.

| Item type     | Actions                                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pinned folder | New File, New Folder, Reveal in Finder, Open in Terminal, Find in Folder, Move Up, Move Down, Open in New Window, Copy Path, Copy Relative Path, Rename, Delete, Set Alias…, Unpin Folder |
| Pinned file   | Open to the Side, Move Up, Move Down, Copy Path, Copy Relative Path, Reveal in Finder, Rename, Delete, Set Alias…, Unpin File                                                             |
| Subfolder     | New File, New Folder, Reveal in Finder, Open in Terminal, Find in Folder, Copy Path, Copy Relative Path, Rename, Delete                                                                   |
| Nested file   | Open to the Side, Reveal in Finder, Copy Path, Copy Relative Path, Rename, Delete                                                                                                         |

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
| Set an alias       | Right-click a pinned root item and choose **Set Alias…**                                          |
| Toggle label style | Open the command palette and run **Pinboard: Toggle Label Style (Folder Name / Relative Path)**   |

---

## Extension Settings

| Setting               | Default    | Description                                                                                                           |
| --------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| `pinboard.scope`      | `"global"` | `"global"` - pins persist across all workspaces. `"workspace"` - pins are scoped to the current workspace.            |
| `pinboard.autoReveal` | `true`     | Auto-reveal the active file in the Pinboard tree when it falls under a pinned folder.                                 |
| `pinboard.labelStyle` | `"name"`   | `"name"` - display the file or folder name (folder name). `"relativePath"` - display path relative to workspace root. |
