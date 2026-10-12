---
name: diagnosing-bugs
description: Use when fixing a bug, a failing or flaky test, or a performance regression in ChatbotX, or when the user says "debug"/"diagnose" or reports something broken, throwing, or slow. A gated loop — build a command that goes red on the bug, minimise, rank hypotheses, instrument, fix with a regression test, clean up. For production triage without a local repro, dispatch the incident-responder agent first.
---

# Diagnosing Bugs (ChatbotX)

A gated loop for hard bugs. Each phase ends on a completion criterion; finish it before starting the next. Skip a phase only when you say why.

Adapted from Matt Pocock's `diagnosing-bugs` skill (github.com/mattpocock/skills).

**Redact first.** Workspace API tokens, channel tokens, `.env` values, and auth headers never appear in what you show: write `<REDACTED>` and keep the credential in an env var the command reads.

## Phase 1 — Build a red loop

This phase is the skill. A **red loop** is one command that drives the real bug path, asserts the user's exact symptom, and fails today. With it, the cause is a matter of time; without it, reading code produces theories, not fixes.

Reach for the cheapest that reaches the bug, in this order:

1. **Failing Vitest test** at the seam that reaches the bug: `pnpm --filter <workspace> exec vitest run <path> -t "<name>"`. Placement follows `testing-workflow` (`<workspace>/__tests__/`).
2. **curl against the public API** on a running builder (`http://localhost:3123/api/...`, `Authorization: Bearer $CHATBOTX_TOKEN`). Specs: `/api/public-spec.json`.
3. **CLI call** (`pnpm --filter chatbotx dev:cli -- <command>`), diffing output against a known-good snapshot.
4. **Replay a captured payload** — a webhook body, a BullMQ job's `data`, a flow version JSON — saved to a fixture and fed straight into the handler (`integrations/<channel>/` parser, `apps/worker/src/**/handlers/`).
5. **Throwaway harness** — a `tsx` script calling one service method with mocked repositories.
6. **Loop the trigger** for a flaky bug (`for i in $(seq 100); do <red command> || echo FAIL; done`): the goal is a reproduction rate high enough to debug, not a clean single repro.
7. **`git bisect run <red command>`** when the bug appeared between two known commits.
8. **Human in the loop** — last resort. If a person must click (a channel's real app, a Meta dashboard), write the exact steps and the exact output to paste back.

Then tighten it: faster (narrow the test scope, skip unrelated setup), sharper (assert the symptom, not "didn't throw"), deterministic (pin time with `vi.useFakeTimers`, seed randomness, mock the network).

**Done when** you can name one command you have already run, shown with its (redacted) output, that is:

- [ ] **Red on this bug** — fails with the user's symptom, and would pass once fixed.
- [ ] **Deterministic** — same verdict every run (flaky bugs: a pinned, high reproduction rate).
- [ ] **Fast** — seconds.
- [ ] **Agent-runnable** — runs unattended.

If you are reading code to form a theory and this command does not exist yet, go back to building it. If you genuinely cannot build one, stop: list what you tried and ask the user for access to a reproducing environment, a redacted captured payload or log, or permission for temporary instrumentation.

## Phase 2 — Reproduce and minimise

Run the loop and confirm it fails with the **user's** symptom, not a nearby failure. Capture the exact error, wrong output, or timing.

Then cut inputs, callers, config, and data one at a time, re-running after each cut. **Done when** every remaining element is load-bearing: removing any one turns the loop green.

## Phase 3 — Rank hypotheses

Write 3–5 hypotheses, ranked, before testing any. Each states a prediction:

> If `<X>` is the cause, then changing `<Y>` makes the bug disappear.

A hypothesis without a prediction is discarded or sharpened. Show the ranked list to the user — they may know the area was just changed, or that one is already ruled out — then continue with your ranking if they are away.

Usual ChatbotX suspects worth a slot on the list: a missing `workspaceId` filter or tenant scope; a stale `withCache` entry or missing TanStack Query invalidation; a retried or concurrent BullMQ job (see `reliability-concurrency`); a drizzle `.default()` with no database default; a channel payload shape that differs from the fixture.

## Phase 4 — Instrument

Each probe tests one prediction from Phase 3; change one variable at a time. Prefer a debugger or a targeted assertion in the red test; otherwise log at the boundary that separates two hypotheses.

Tag every temporary log with one unique prefix, e.g. `logger.debug({ value }, "[DEBUG-a4f2] …")`, so cleanup is a single grep. For performance, measure before changing: a timing harness, or `EXPLAIN ANALYZE` on the query the repository builds.

## Phase 5 — Fix with a regression test

1. Turn the minimised repro into a test at the seam where the bug really occurs.
2. Watch it fail.
3. Apply the fix.
4. Watch it pass, then re-run the Phase 1 loop on the original, un-minimised scenario.

If no seam reproduces the real call pattern (the bug needs several callers, or a chain a unit test cannot build), a shallow test gives false confidence. Report the missing seam as a finding instead.

## Phase 6 — Clean up

- [ ] The Phase 1 loop is green on the original scenario.
- [ ] The regression test passes, or the missing seam is reported.
- [ ] `grep -rn "DEBUG-a4f2" apps packages integrations` returns nothing.
- [ ] Throwaway scripts and fixtures are deleted.
- [ ] The `testing-workflow` gate passes (lint, `check-types`, tests).
- [ ] The confirmed hypothesis is stated in the commit or PR message.
