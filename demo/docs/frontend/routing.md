# Routing

React Router v6 with a single `BrowserRouter` in `App.tsx`.

## Route tree

```
/login              → <Login>  (public)
/*                  → layout (auth-gated)
  /dashboard        → <Dashboard>
  /products         → <Products>
  /orders           → <Orders>
  /customers        → <Customers>
  /settings         → <Settings>
```

## Auth gating

The `/*` route wraps content in `<RequireAuth>`. If the user is not logged in, they are redirected to `/login?next=<current-path>`. After a successful login the `next` param is used to redirect back.

## Lazy loading

Large pages (Analytics, Reports) are code-split with `React.lazy`:
```tsx
const Analytics = React.lazy(() => import('./pages/Analytics'));
```
Wrap with `<Suspense fallback={<Spinner />}>` in `App.tsx`.
