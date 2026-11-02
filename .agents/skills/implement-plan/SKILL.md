---
name: implement-plan
description: Use when the user hands over an approved implementation plan (a plan path) and asks to implement, continue, or resume it. Executes the next unfinished task without replanning or expanding scope.
---

# Implement Approved Plan

Use this skill when the user gives an approved implementation plan and asks to implement it, continue it, or run implementation mode.

## Operating Mode

- The plan is already approved; execute it instead of creating a new plan.
- Keep changes minimal and scoped to the approved task.
- Reuse existing architecture, APIs, schema, and local patterns.
- Do not redesign, expand scope, or perform unrelated refactors.
- Work on one independently deliverable unfinished task at a time.

## Starting Workflow

When given a plan path:

1. Read the plan completely.
2. Check completed items (`- [x]`).
3. Read the original ticket only if it is referenced or provided.
4. Read all files referenced by the plan.
5. Read the surrounding implementation before editing.
6. Create an internal task list.
7. Implement the highest-priority unfinished task.

If no plan path is provided, ask for one.

Your first action must be reading the plan and relevant files. Your first code-changing action should be implementation, not replanning.

## Execution Rules

- Do not create a new implementation plan.
- Do not rewrite plan content.
- You may update only task checkboxes/status after the task is implemented and verified.
- Do not ask for approval before coding unless there is ambiguity, a plan mismatch, or an unsafe/destructive operation.
- Do not pause to summarize before implementation.
- Stop after the selected task is complete unless the user explicitly asks to continue.

Prefer the smallest independently deliverable unfinished task.

## Plan Mismatch

If reality differs from the plan, stop and report:

```text
Issue in Phase [N]

Expected:
[what the plan specifies]

Found:
[actual implementation reality]

Why this matters:
[technical impact]

Recommended path:
[best option]
```

Wait for guidance before proceeding.

## Verification

After implementation:

- Run relevant tests.
- Run lint or targeted formatter/check commands.
- Run typecheck for touched app/package when available.
- Fix issues introduced by your changes.
- Verify plan success criteria.

Run full build only when the task scope or plan requires it.

## Manual Verification

Pause for manual verification only when:

- The plan explicitly requires manual testing.
- The implementation cannot be fully validated automatically.
- User interaction is required.

Do not mark manual verification items complete until the user confirms.

## Resuming Work

- Trust completed checkboxes unless they block the current task, conflict with current code, or verification fails.
- Resume from the first unfinished item by priority.
- Revisit completed work only when necessary for the current task.

## Final Output

Report:

- Task implemented and why.
- Files changed and why.
- Validation commands and results.
- Remaining unfinished tasks from the plan.
