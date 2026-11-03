---
name: turborepo-workflow
description: >-
  Use when adding a workspace package or dependency, wiring a package `exports`
  subpath, changing `turbo.json`, debugging env loading (`dotenv -e ../../.env`,
  `SKIP_ENV_CHECK`), or when a green `pnpm build` is mistaken for a type check
  in this pnpm + Turborepo monorepo. Root commands live in AGENTS.md.
---

# Turborepo Workflow

## Project Overview

Monorepo managed by **pnpm workspaces + Turborepo**. Node >= 24, TypeScript 5.

### Workspace Layout

The authoritative layout table is **`AGENTS.md` → "Repository layout"**. A hand-copied tree
here would drift (and did) — list the real thing instead:

```bash
ls apps packages integrations
pnpm ls -r --depth -1        # every workspace package with its name
```

Ports worth knowing: builder `3123`, realtime `1999`.

## Commands

The root command list (dev, build, lint, fix, test, database, circular/unused checks) is in
**`AGENTS.md` → "Commands (root)"** — not repeated here. Extras not listed there:

```bash
pnpm --filter builder https          # builder dev server over HTTPS
pnpm --filter <workspace> check-types
pnpm turbo run check-types           # every workspace
```

## Package Management

- Use `pnpm add <pkg> --filter <workspace>` to add dependencies to specific workspace
- Shared versions live in the `catalog:` block of `pnpm-workspace.yaml`; a `package.json` references them as `"<pkg>": "catalog:"`. Bump a shared dependency by editing that one line, never per-workspace. Move a dependency into the catalog once 3+ workspaces use it, or when it must stay in lockstep with one already there (`better-auth` + `@better-auth/*`, `drizzle-orm` + `drizzle-kit`, `react` + `react-dom` + types). `catalogMode: strict` makes `pnpm add` write `catalog:` for catalogued packages.
- Workspace packages use `@chatbotx.io/*` scope
- Cross-workspace imports must go through a package's `exports` map: `@chatbotx.io/database/client`, `@chatbotx.io/ui/components/ui/button` (the UI package exports `./components/*`, `./lib/*`, `./hooks/*`, … — there is no bare `@chatbotx.io/ui/button`).
- Package exports are defined in each `package.json` `exports` field

### Adding a New Workspace Package

When creating a new package (e.g. `integrations/<channel>/`):

1. Create `package.json` with `"name": "@chatbotx.io/<name>"`
2. Add `"@chatbotx.io/<name>": "workspace:*"` to consumer `package.json` dependencies
3. Run `CI=true pnpm install --no-frozen-lockfile` to link the package
   - **MUST** use `CI=true` to avoid TTY confirmation prompt in non-interactive shells
   - Without this step, imports of the new package will fail with `Cannot find module`

## Turbo Pipeline

Defined in `turbo.json`:

- `build` depends on `^build` (builds dependencies first), outputs `.next/**`, `dist/**`
- `dev`, `https`, `packages:dev` are persistent (long-running)
- `db:migrate`, `db:setup`, `db:reset`, `db:studio` are non-cached
- **`build` does NOT type-check the builder**: `next build` runs with
  `typescript.ignoreBuildErrors: true` (the in-build tsc pass duplicated
  `check-types` and OOMed a 4GB heap). A green build proves nothing about
  types — always run `pnpm --filter builder check-types` (or
  `pnpm turbo run check-types`). CI enforces this in
  `.github/workflows/ci.yml`, and `release.yml`'s `check` job gates image
  publishing on the same command set.

## Environment

- Root `.env` file is loaded by apps via `dotenv -e ../../.env`
- Env validation uses `@t3-oss/env-core` + Zod in `keys.ts` files
- `SKIP_ENV_CHECK=true` to bypass validation during build

## Git Hooks

- **lefthook** manages pre-commit hooks (see `lefthook.yml`)
