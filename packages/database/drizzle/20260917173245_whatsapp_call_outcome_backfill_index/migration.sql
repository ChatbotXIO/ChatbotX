-- Migration 2/3 of the `outcome` rollout. Every statement here uses
-- `CONCURRENTLY` (index build) or is itself idempotent (`WHERE ... IS NULL`
-- guarded UPDATE), so the runner (`scripts/run-migrations.mjs`) executes this
-- whole file UNWRAPPED — no transaction, no ACCESS EXCLUSIVE lock — and each
-- statement is safe to re-run if a prior run failed partway.
--
-- This file only BUILDS the new covering index — it deliberately never drops
-- the old `WhatsappCall_workspaceId_createdAt_idx`. Dropping it lives in the
-- NEXT migration (20260917173246_whatsapp_call_outcome_drop_legacy_index)
-- (review A-HIGH): if this file's `CREATE INDEX CONCURRENTLY` succeeded but
-- the process died before `run-migrations.mjs` recorded the migration (it
-- only records after every statement in the file completes), a retry would
-- re-run this whole file from the top. Had the old-index DROP still lived
-- here, that retry's unconditional guard-drop of the NEW index (see below)
-- would fire, then the CREATE would be rebuilding the new index, all while
-- the OLD index was already gone — leaving the table with ZERO covering
-- indexes for the rebuild's duration. Keeping the drop in its own migration
-- means the old index is never touched until this file has fully completed
-- and been recorded, so a retry of this file alone can never leave the table
-- without a covering index — the old one is always still there.
--
-- Backfill 1/2 (MUST run before backfill 2/2): an outbound call the agent
-- hung up before the customer answered persisted as `status = 'failed'` with
-- the business-cancel marker on `lastError`
-- (`CALL_CANCELED_BY_BUSINESS_LAST_ERROR`,
-- packages/sdk/src/lib/shared/message.ts:333, value "canceled_by_business").
-- This must be written first — the general terminal backfill right after it
-- would otherwise stamp these same rows `outcome = 'failed'` before this
-- statement gets a chance to run, since both guard on `"outcome" IS NULL`.
UPDATE "WhatsappCall"
SET "outcome" = 'canceled'
WHERE "status" = 'failed'
  AND "lastError" = 'canceled_by_business'
  AND "outcome" IS NULL;--> statement-breakpoint
-- Backfill 2/2: every other already-terminal row simply mirrors its own
-- status (`completed`/`failed`/`rejected`) — the `canceled` refinement
-- backfilled above is the only status/outcome mismatch that ever existed
-- pre-migration. `"outcome" IS NULL` also protects a legacy row backfill 1/2
-- already claimed.
UPDATE "WhatsappCall"
SET "outcome" = "status"::text::"whatsappCallOutcome"
WHERE "status" IN ('completed', 'failed', 'rejected')
  AND "outcome" IS NULL;--> statement-breakpoint
-- Call log page: cursor-paginated `(createdAt, id)` scan per workspace,
-- `id desc` tie-breaking rows sharing the same `createdAt` — replaces the
-- 2-column `WhatsappCall_workspaceId_createdAt_idx`, which the NEXT
-- migration drops once this one is fully applied. Built CONCURRENTLY (no
-- SHARE lock, no blocked inserts); the old index is left untouched by this
-- file, so the call-log query always has a covering index to use, even
-- mid-migration or mid-retry of this file.
--
-- Retry safety: a `CREATE INDEX CONCURRENTLY` that fails partway (e.g. a
-- conflicting lock, a killed session) leaves the index behind in Postgres
-- catalog as INVALID rather than rolling it back — CONCURRENTLY builds
-- cannot use the ordinary transactional rollback. `IF NOT EXISTS` on its own
-- would then treat that invalid index as "already there" on the next run and
-- silently skip rebuilding it, permanently losing the call-log page's
-- covering index once the next migration drops the old one. We considered a
-- `DO $$ ... pg_index.indisvalid ...$$` guard (option a as originally
-- proposed) but Postgres refuses to run `CREATE`/`DROP INDEX CONCURRENTLY`
-- inside a PL/pgSQL block — same restriction as `REINDEX CONCURRENTLY`,
-- which cannot run "within a stored procedure or DO block" (Postgres docs).
-- So instead: unconditionally drop any existing
-- "WhatsappCall_workspaceId_createdAt_id_idx" — CONCURRENTLY, IF EXISTS —
-- immediately before (re-)building it. On a clean first run this is a
-- harmless no-op (nothing to drop yet). On a retry after a failed build it
-- removes the INVALID leftover so the following `CREATE ... IF NOT EXISTS`
-- is forced to actually rebuild the index rather than silently no-op on an
-- unusable one. The only cost of this guard is a wasted rebuild in the rare
-- case where the CREATE below had already succeeded but the migration
-- crashed before recording itself — safe and cheap (CONCURRENTLY, no
-- blocking lock), never data loss, and the old index is never at risk since
-- it lives in a separate migration.
DROP INDEX CONCURRENTLY IF EXISTS "WhatsappCall_workspaceId_createdAt_id_idx";--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "WhatsappCall_workspaceId_createdAt_id_idx" ON "WhatsappCall" ("workspaceId","createdAt" DESC NULLS LAST,"id" DESC NULLS LAST);
