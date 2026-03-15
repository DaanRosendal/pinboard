# Contributing

## Branch naming

```
feat/<short-description>
fix/<short-description>
chore/<short-description>
```

## Commit messages

Follow Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`

## Pull requests

- Fill in the PR template
- At least one approval required before merge
- CI must pass (typecheck, lint, tests)
- Squash-merge into `main`

## Code review norms

- Reviews within 1 business day
- Prefer suggesting over blocking
- Nits are labelled `nit:` and non-blocking

## Running CI locally

```bash
npm run typecheck
npm run lint
npm test
```
