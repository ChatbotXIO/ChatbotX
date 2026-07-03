---
name: "source-command-implement-plan"
description: "Implement approved technical plans with execution-first behavior"
---

# source-command-implement-plan

Use this skill when the user asks to run the migrated source command `implement-plan`.

## Command Template

# Implement Plan

You are in IMPLEMENTATION MODE.

The implementation plan has already been approved.

Your responsibility is execution, not planning.

Follow the shared repository workflow in `.agents/skills/implement-plan/SKILL.md`.

## Core Principles

- Implement code, do not create plans.
- Follow the implementation plan exactly.
- Respect approved architecture decisions.
- Respect approved API contracts.
- Respect approved database schema.
- Reuse existing code whenever possible.
- Keep changes minimal and focused.
- Avoid speculative improvements.
- Avoid unrelated refactoring.
- Do not expand scope.

## Getting Started

When given a plan path:

1. Read the plan completely.
2. Check for completed items (- [x]).
3. Read the original ticket if it is referenced or provided.
4. Read all files referenced by the plan.
5. Read files completely.
6. Understand the surrounding code before making changes.
7. Create an internal task list.
8. Begin implementation immediately.

If no plan path is provided, ask for one.

## Critical Execution Rules

- DO NOT create a new implementation plan.
- DO NOT rewrite the existing implementation plan.
- Only update task checkboxes/status after implementation and verification.
- DO NOT ask for approval before coding.
- DO NOT explain what you intend to do before making changes.
- DO NOT stop to summarize before implementation.
- DO NOT pause unless blocked by ambiguity or a plan mismatch.

Your first action should be reading the plan and relevant files.

Your first response should never be a plan.

## Implementation Process

1. Read the implementation plan.
2. Find the highest-priority unfinished task.
3. Implement that task completely.
4. Verify the implementation.
5. Update task checkbox/status if applicable.
6. Stop after the task is complete.

Only work on ONE task at a time.

Prefer the smallest independently deliverable unfinished task.

Do not automatically continue to the next task.

## Plan Mismatch Handling

If reality differs from the plan:

STOP and explain:

Issue in Phase [N]

Expected:
[what the plan specifies]

Found:
[actual implementation reality]

Why this matters:
[technical impact]

Recommended path:
[best option]

Wait for guidance before proceeding.

## Verification

After implementation:

- Run relevant tests.
- Run lint.
- Run typecheck.
- Fix all issues introduced by your changes.
- Ensure the project builds successfully.
- Verify success criteria defined in the plan.

## Manual Verification

Only pause for manual verification when:

- The plan explicitly requires manual testing.
- The implementation cannot be fully validated automatically.
- User interaction is required.

Otherwise continue implementation.

Do not mark manual verification items complete until confirmed by the user.

## Resuming Work

If checkmarks already exist:

- Trust completed work unless it blocks the current task, conflicts with current code, or verification fails.
- Resume from the first unfinished item.
- Only revisit completed work if necessary.

## Output Format

### Task Implemented

- What was implemented
- Why it was required

### Files Changed

- File path
- Reason for change

### Validation

- Tests executed
- Test results
- Lint status
- Typecheck status
- Build status

### Remaining Work

- Remaining unfinished tasks from the implementation plan

## Important

- Implementation first.
- Code first.
- No planning.
- No redesign.
- No scope expansion.

Your first code-changing action should be implementation, not replanning.
