@AGENTS.md

## Claude Code — additional guidance

### Preferred workflow

1. Read the relevant skill file in `.agents/skills/` before writing code for a new feature, API, database table, worker, or integration.
2. When touching `packages/database`, always run `pnpm --filter @chatbotx.io/database db:migrate` after schema changes.
3. After any code change, run `pnpm lint` and `pnpm --filter <app> check-types` before reporting done.
4. Use `pnpm fix` (Biome auto-fix) instead of manually formatting code.

### Skill → task mapping

| Task | Skill to read first |
|------|---------------------|
| New feature / page | `feature-scaffold` |
| New API endpoint | `orpc-api` |
| New DB table or migration | `drizzle-database` |
| New background job or queue | `worker-development` |
| New channel integration | `integration-channel` |
| New flow step with states (success/error/skip routing) | `flow-step-development` |
| Dev/build/lint commands | `turborepo-workflow` |

### Never do without checking

- Do not use `git add -A` or `git add .` — stage specific files only.
- Do not commit `.env` files or secrets.
- Do not skip `pnpm lint` — the CI will fail.
- Do not hardcode user-facing strings — use `useTranslations()`.
- Do not import `db` directly in `apps/` or `integrations/` — all DB access must go through a service (`@chatbotx.io/business`) or repository (`@chatbotx.io/database/repositories`). See `.agents/rules/data-access.md`.
