-- Transactional and fast (a single nullable column add is metadata-only),
-- so this takes only a brief ACCESS EXCLUSIVE lock on "WorkspaceMember".
-- `lock_timeout` fails fast rather than queuing behind a long-running
-- transaction and blocking everything queued after it (same pattern as
-- `20260917173244_whatsapp_call_outcome_type_column`).
SET LOCAL lock_timeout = '5s';--> statement-breakpoint

-- When this member most recently transitioned offline -> online (their
-- first live Redis heartbeat after having none), in any workspace they
-- belong to. NULL until their first-ever heartbeat. A durable, coarse
-- "last came online" stamp for reporting only — monotonic, never cleared —
-- see `packages/database/src/schema/workspace-member.ts` for the full
-- contract. Redis remains the sole source of truth for whether a member is
-- online RIGHT NOW (`workspacePresenceService`), so there is no matching
-- "offline" column or write.
ALTER TABLE "WorkspaceMember" ADD COLUMN "onlineSince" timestamp(6) with time zone;