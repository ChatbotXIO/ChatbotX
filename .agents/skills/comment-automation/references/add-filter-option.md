# Adding a new filter option (recipe)


1. Add the field to `commentOptionsSchema` (partials) + DB default in the schema file
   (`jsonb` default string).
2. If it needs a DB lookup, add a method to `commentAutomationService` (reuse the dedup
   table + its index where possible; prefer `LIMIT 1` existence checks).
3. Add the guard inside the loop in `processCommentAutomation`, **with a
   `logAutomationSkipped(..., reason)` AND a `collectMiss(automation.id, <reason>)` before
   `continue`** — plus the new value in `commentAutomationMissReasons` (pgEnum → migration).
4. Surface the toggle in `apps/builder/src/features/fb-comments/components/fb-comment-form.tsx`
   and add i18n keys to **every** locale file in `apps/builder/messages/` (the i18n parity
   check in `pnpm lint` fails on a missing key in any of the 20 locales).
5. Extend `apps/worker/__tests__/comment-automation.test.ts` — including a row in the
   `gateCases` table under `describe("processCommentAutomation misses")`.
