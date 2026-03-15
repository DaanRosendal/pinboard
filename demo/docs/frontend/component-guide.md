# Component Guide

## Conventions

- One component per file, named after the file (`Button.tsx` exports `Button`)
- Props interfaces directly above the component, not exported unless shared
- Use `function` declarations, not arrow functions, for top-level components

## Core components

### Button
```tsx
<Button label="Save" variant="primary" onClick={handleSave} />
<Button label="Delete" variant="danger" disabled={isPending} />
```
Variants: `primary` | `secondary` | `danger`

### DataTable
Generic table with typed columns. Pass `loading` to show spinner, `emptyMessage` for empty state.

### Sidebar / Navbar
Layout components — do not render conditionally. Auth-gate the whole `/*` route instead.

## Adding a new page

1. Create `src/pages/MyPage.tsx`
2. Add a `<Route>` in `App.tsx`
3. Add a link in `Sidebar.tsx` if it needs top-level navigation
4. Export from `src/pages/index.ts`
