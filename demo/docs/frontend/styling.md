# Styling Guide

## Approach

Plain CSS with BEM-ish naming. No CSS-in-JS. One global stylesheet at `src/styles/global.css`.

## Class naming

```
.block
.block__element
.block--modifier
```

Examples:
- `.navbar`, `.navbar__brand`, `.navbar__links`
- `.btn`, `.btn--primary`, `.btn--danger`
- `.stat-card`, `.stat-card__value`, `.stat-card__delta`

## Design tokens

Set as CSS custom properties in `:root`:

| Token | Value |
|-------|-------|
| `--color-primary` | `#2563eb` |
| `--color-danger` | `#dc2626` |
| `--color-surface` | `#ffffff` |
| `--color-muted` | `#6b7280` |
| `--radius` | `6px` |
| `--shadow` | `0 1px 3px rgba(0,0,0,.12)` |

## Responsive breakpoints

- Mobile: `< 640px`
- Tablet: `640px – 1024px`
- Desktop: `> 1024px`
