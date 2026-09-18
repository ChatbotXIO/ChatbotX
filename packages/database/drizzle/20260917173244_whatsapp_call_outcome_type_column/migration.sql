-- Migration 1/2 of the `outcome` rollout — transactional and fast, so it
-- takes only a brief ACCESS EXCLUSIVE lock on `WhatsappCall` (enum create +
-- nullable column add are both metadata-only). The index swap and the data
-- backfills live in the NEXT migration instead: they use a non-transactional
-- index-build mode (which cannot execute inside a transaction block) and
-- each touch every row of the table — bundling them here would hold ACCESS
-- EXCLUSIVE for the whole backfill/build duration and block every live call
-- webhook/read. `lock_timeout` fails fast rather than queuing behind a
-- long-running transaction and blocking everything queued after it (see
-- `20260712170535_contact_filter_w1_last_sent_index` for the same pattern).
SET LOCAL lock_timeout = '5s';--> statement-breakpoint

-- Display `outcome` for a terminal `WhatsappCall.status`, written together
-- with every terminal status write from here on (`resolveWhatsappCallOutcome`,
-- packages/database/src/partials/whatsapp-call.ts). Nullable: `null` for a
-- non-terminal row (ringing/accepted) and, until the backfills in the next
-- migration run, for a legacy terminal row. Any pod still on the OLD image
-- during a rolling deploy writes terminal rows with `outcome` left NULL —
-- every reader of this column must `coalesce(outcome, status)` until P5b's
-- kind rules land (see `docs/whatsapp-calling-voip.md` and
-- `resolveWhatsappCallOutcome`'s doc comment).
CREATE TYPE "whatsappCallOutcome" AS ENUM('completed', 'failed', 'rejected', 'canceled');--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD COLUMN "outcome" "whatsappCallOutcome";
