---
description: Triage and fix the open rows in local://review-findings.md, classifying every one as fixed, wont-fix, or invalid
---

Work the findings file at `$1` (default `local://review-findings.md`) to zero open rows.

## Steps

1. Read the findings file. If it does not exist or has no rows, stop and tell the user to run `/review-diff` first - do not go looking for things to fix.
2. Load every `open` row into `todo`, one task per ID, and work them in severity order: `blocker`, then `should`, then `nit`.
3. For each row, read the cited code first, then classify:
   - `fixed` - the minimal change that resolves exactly that finding
   - `wont-fix` - real but out of scope or accepted; Note must say why and what the full fix would require
   - `invalid` - the reviewer was wrong; Note must cite the `path:line` evidence that disproves it
4. Never widen scope. No refactors, renames, dependency bumps, or unrelated cleanups. If a finding cannot be fixed without a larger change, it is `wont-fix` with that change described - not a silent half-fix.
5. Update the row's Status and Note in the findings file as each row settles, not in one batch at the end.
6. Verify only what you touched: `pnpm lint`, then `pnpm --filter <workspace> check-types` for each touched workspace, then the vitest suites covering the changed files. Never set `VITEST_SKIP_COVERAGE_THRESHOLDS`.
7. Commit once: `fix(<scope>): address review round <n>`. Stage only the files you changed - never `git add -A` or `git add .`, never `--no-verify`, never commit on `main`.

## Output

Start your final message with the literal line below. `<n>` is the review round number from the findings file. `<fixed>`, `<wont-fix>`, and `<invalid>` are exactly three integers - no other categories, no extra numbers - counted directly from the final Status column of the findings file (count each of the three values across every row) after all updates are written; they must sum to the total row count. Do not state a different tally anywhere else in the message.

`FIX ROUND <n> - <fixed>/<wont-fix>/<invalid>`

Then the commit sha, the list of touched files, the verification results, and the remaining `open` rows (must be zero).

## Guardrails

- A finding is not `fixed` because the symptom stopped reproducing - fix the cause.
- Never delete or loosen a test to make a gate pass; that is a new finding against yourself.
- Never edit the Finding or Location column of an existing row; only Status and Note.
