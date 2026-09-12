---
description: Round 2 review - verify each finding is actually resolved and hunt regressions introduced by the fixes
---

Second-pass review of the fixes. Report-only: no edits, no commits.

## 1. Resolve inputs

Findings file: `$2` if given, else `local://review-findings.md`. If every row is still `open`, stop - `/fix-findings` has not run.

Fix range: `$1` if given, else `<Commit recorded in the findings file>..HEAD`. This is deliberately the fix diff only, not the original change - re-reviewing everything reproduces round 1 and hides regressions the fixes caused.

## 2. Fan out three lanes in one `task` batch

All read-only, in parallel, citing `path:line`.

| Lane | Agent | Focus |
| --- | --- | --- |
| verify | `reviewer` | for each non-`open` row, read the post-fix code and return a verdict: `confirmed`, `not-fixed`, `partial`, or `disputed` (a `wont-fix`/`invalid` whose stated reason does not hold) |
| regression | `reviewer` | the fix diff only: changed signatures with stale callers (use `lsp` references, not grep), altered control flow, broken project invariants, tests deleted or weakened |
| security | `security-reviewer` | only the files touched by the fix diff; read `skill://security-review` first |

## 3. Write back

Append to the findings file:

```
## Round 2

Fix range: <range>

|ID|Verdict|Evidence|
|---|---|---|
|F1|confirmed|apps/builder/src/x.ts:44|
```

New problems found in round 2 become new rows `F<n>r2` in the round-1 table with Status `open`.

## 4. Output

Start your final message with the literal line:

`REVIEW ROUND 2 - <fix range>`

Then the verdict table, then:

`VERDICT: CLEAN` only when every round-1 row is `confirmed` and round 2 added no `blocker` row; otherwise `VERDICT: NOT CLEAN` followed by the blocking IDs and the instruction to run `/fix-findings` again and repeat this command.

## Guardrails

- Never mark `confirmed` without reading the post-fix code - the fix report is not evidence.
- A test deleted or loosened to make a gate pass counts as `not-fixed` for the row it was meant to cover.
- Do not re-report round-1 findings that are `confirmed`; that is churn.
