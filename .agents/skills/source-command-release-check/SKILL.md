---
name: "source-command-release-check"
description: "Run the full pre-release verification gate (lint, types, tests, coverage) and report readiness"
---

# source-command-release-check

Use this skill when the user asks to run the migrated source command `release-check`.

## Command Template

Verify the repo is release-ready by running the gate sequence from the `testing-workflow` skill. CI only builds Docker images, so this gate is your real safety net — run it before tagging a release or opening a release PR.

## Steps

1. **Scope** — determine what changed: `git diff main...HEAD --stat` (or the given range). Identify the touched workspaces.

2. **Lint** — `pnpm lint`. If it fails, stop and report; suggest `pnpm fix` for auto-fixable issues.

3. **Types** — for each touched workspace: `pnpm --filter <workspace> check-types`. Report the first failure per workspace.

4. **Tests + coverage** — run the affected packages' Vitest suites. Do **not** set `VITEST_SKIP_COVERAGE_THRESHOLDS`; the 80% threshold must hold (`packages/vitest-config/src/node.ts`). Report any suite below threshold.

5. **Invariant scan** — dispatch the `invariant-guard` agent on the diff to catch the non-lintable invariants.

6. **Secret scan** — grep the diff for credential patterns (`PGPASSWORD`, `DATABASE_URL=`, API keys); confirm no `.env`/secret is staged.

## Output

A readiness checklist:

```
RELEASE CHECK
- lint:        PASS / FAIL (<detail>)
- types:       PASS / FAIL (<workspace>)
- tests:       PASS / FAIL (<suite>)
- coverage:    >=80% / BELOW (<package> <n>%)
- invariants:  PASS / <n> violations
- secrets:     CLEAN / FOUND (<file:line>)
=> READY / NOT READY
```

## Guardrails

- Read-only verification — do not edit code to make a gate pass; report the failure and let the owner fix it.
- Never report READY on a gate you did not actually run; say which gate was skipped and why.
- Never bypass coverage with the skip env var.
