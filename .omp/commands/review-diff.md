---
description: Round 1 review - fan out correctness, security, and invariant lanes over a git range and write local://review-findings.md
---

Review the change identified by `$ARGUMENTS` and produce a findings file. This command is report-only: neither you nor any subagent may edit code, run `pnpm fix`, or run a project-wide test suite.

## 1. Resolve the range

- `$1` is non-empty: the resolved range **is** `$1`, used verbatim (for example `main...HEAD` or `HEAD~2..HEAD`). This is authoritative - do **not** run `git status --porcelain` or otherwise inspect the working tree to pick a different range. A dirty working tree is irrelevant when `$1` is provided; review exactly the commits in `$1`, never the uncommitted state on top of them.
- `$1` is empty (only then): run `git status --porcelain`. Non-empty means review the working tree - resolved range is the literal label `HEAD..working-tree`, scope is `git diff HEAD` plus untracked files from `git ls-files --others --exclude-standard`. Empty means the resolved range is `HEAD~1..HEAD`.

Record the resolved range and `git rev-parse --short HEAD`. Capture the changed-file list once with `git diff --stat <range>` and give the same list to every lane so the lanes review the same set.

## 2. Fan out three lanes in one `task` batch

All three run in parallel, are read-only, and must cite `path:line` they actually read. Batch context must state: the resolved range, the changed-file list, "report rows only, no prose summary", "make no edits", "run no project-wide lint/typecheck/test".

| Lane | Agent | Focus |
| --- | --- | --- |
| correctness | `reviewer` | logic errors, unhandled null and error paths, wrong async/await, N+1 queries, missing cache invalidation, and the `action \| API handler -> service -> repository` boundary in `.agents/rules/data-access.md` |
| security | `security-reviewer` | read `skill://security-review` first, then workspace/tenant isolation, authz on server actions and public-API scopes, untrusted channel content reaching an AI prompt, secrets in logs |
| invariants | `reviewer` | the numbered invariants in `.github/copilot-instructions.md` - triple-d middleware names, the `relations/index.ts` double edit, `ChannelType` and flow-node-type cascades, `.bind(null, workspaceId)` with `bindArgsSchemas`, no `db` import in the app layer, i18n-mandatory strings, `logger.error({ err })` never `{ error }` - plus `.agents/rules/no-dynamic-import.md` |

## 3. Merge and write the findings file

Merge the lane rows. Two lanes reporting the same `path:line` and the same root cause collapse into one row that keeps the highest severity and names both lanes in Note.

Write this to `local://review-findings.md` (overwrite any previous content):

```
# Review findings

Range: <resolved range>
Commit: <short sha>
Round: 1

|ID|Sev|Location|Finding|Status|Note|
|---|---|---|---|---|---|
|F1|blocker|apps/builder/src/x.ts:42|one sentence, concrete|open||
```

`Sev` is `blocker`, `should`, or `nit`. Every row starts at Status `open`. IDs are `F1`, `F2`, ... in severity order.

## 4. Output

Start your final message with the literal line, using the exact `<resolved range>` chosen in step 1 (never re-derived, never a re-check of the working tree at output time):

`REVIEW ROUND 1 - <resolved range>`

Then the same table, then the path of the findings file, then the blocker count.

## Guardrails

- No edits, no commits, no `pnpm fix`.
- Drop any finding whose `path:line` you did not read this session.
- Do not report formatting or style that `pnpm lint` already catches - ultracite/biome owns those.
- Zero findings is a valid result: still write the file with an empty table and say so explicitly.
