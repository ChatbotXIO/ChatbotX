import {
  COEXIST_CHANNELS,
  type CoexistChannel,
} from "@chatbotx.io/utils/channel"
import { sql } from "drizzle-orm"
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type CoexistRunType,
  coexistRunTypes,
} from "../partials/coexist-sync-run"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"

/**
 * Aggregate sync log for WhatsApp and Messenger coexistence history imports.
 * One row per sync attempt (triggered by popup-enable, buffer-chain, sweep-cron,
 * or manual). Records live progress counters and outcome counters — no per-contact
 * detail rows (by design).
 *
 * Handlers must:
 * 1. INSERT on start → capture runId
 * 2. UPDATE currentScan/currentStep/lastHeartbeatAt periodically (every ~50 items or step change)
 * 3. UPDATE importedContactCount/importedMessageCount/skippedCount/failedCount in batches
 * 4. UPDATE status/finishedAt/currentError on finish
 */
// Values come from `@chatbotx.io/utils/channel` (`COEXIST_CHANNELS`) so this
// enum can never drift from the shared list other layers (e.g.
// `@chatbotx.io/business`) key off of. Same three values as before this
// change — verified to emit no migration SQL.
//
// Cast to the literal union (not `[string, ...string[]]` like e.g.
// `whatsappRegistrationStatus`): `COEXIST_CHANNELS` is a plain
// `CoexistChannel[]` at the type level (zod's `.options` doesn't preserve
// tuple-ness), and widening the cast to `string` would widen
// `coexistChannel`'s inferred column type too, breaking every
// `Record<CoexistChannel, ...>` consumer (e.g. `apps/worker`'s
// `scan-coexist-runs.ts`).
export const coexistChannel = pgEnum(
  "coexistChannel",
  COEXIST_CHANNELS as [CoexistChannel, ...CoexistChannel[]],
)

// `waiting` is WhatsApp-only and NON-terminal: the run has drained everything
// staged so far and is waiting for Meta to push the next history chunk (which
// can take up to 24h). `finishedAt` stays NULL while waiting. Messenger and
// Instagram runs never enter it.
export const coexistRunStatus = pgEnum("coexistRunStatus", [
  "init",
  "running",
  "succeeded",
  "failed",
  "partial",
  "waiting",
])

// Discriminates the two kinds of run this shared table now carries: a
// WhatsApp/Messenger/Instagram coexistence history import (`coexist`, the
// original/default kind — existing rows backfill to it) or an Automatic
// Customer Scan (`contact_scan`). Every existing coexist set-query MUST
// filter `type = 'coexist'` and every scan set-query MUST filter
// `type = 'contact_scan'` — see `coexist-sync-run/repository.ts`'s method
// table. By-id methods are safe as-is (the PK is unique across types).
export const coexistRunType = pgEnum(
  "coexistRunType",
  coexistRunTypes.options as [CoexistRunType, ...CoexistRunType[]],
)

/**
 * Post-batch patches (media follow-up, edit, revoke) that could not be applied
 * because Meta delivered them BEFORE the message they target. They are carried
 * on the run and retried at the start of every later flush batch instead of
 * being dropped — the staging rows that carried them are still marked
 * processed, so dropping them lost the media for good.
 *
 * Structurally compatible with the SDK's `IncomingAttachment` in both
 * directions, without `packages/database` depending on `@chatbotx.io/sdk`.
 */
export type PendingCoexistAttachment = {
  sourceId: string
  fileType: "image" | "audio" | "video" | "file"
  mimeType: string
  originPath: string
  size: number
  url?: string
  width?: number | null
  height?: number | null
  name?: string
}

type PendingCoexistPatchBase = {
  /** Customer wa_id (or BSUID fallback) the patched message belongs to. */
  contactWaId: string
  /** wamid of the message being patched. */
  sourceId: string
  /** ISO timestamp of the first flush that failed to resolve this patch. */
  stagedAt: string
}

export type PendingCoexistPatch =
  | (PendingCoexistPatchBase & {
      kind: "media"
      attachment: PendingCoexistAttachment
    })
  | (PendingCoexistPatchBase & {
      kind: "edit"
      text: string | null
      attachment: PendingCoexistAttachment | null
    })
  | (PendingCoexistPatchBase & { kind: "revoke" })

export type PendingCoexistPatches = {
  entries: PendingCoexistPatch[]
}

// Messenger 2-phase sync: phase 1 walks /conversations and upserts contacts;
// phase 2 walks /conversations again per conv to fetch and persist messages.
// Sequential — phase 2 starts only after phase 1 covers every conversation
// within the run's frontier+ceiling window.
export const coexistMessengerSyncPhase = pgEnum("coexistMessengerSyncPhase", [
  "contacts",
  "messages",
])

export const coexistSyncRunModel = pgTable(
  "CoexistSyncRun",
  {
    ...sharedColumns,
    workspaceId: bigintAsString().notNull(),
    integrationId: bigintAsString().notNull(),
    channel: coexistChannel().notNull(),
    // Discriminates a coexist history import from an Automatic Customer
    // Scan. Existing rows backfill to "coexist". See the `coexistRunType`
    // comment above for the scoping invariant this enforces.
    type: coexistRunType().notNull().default("coexist"),
    status: coexistRunStatus().notNull().default("init"),
    // "popup-enable" | "buffer-chain" | "sweep-cron" | "manual"
    triggerSource: text().notNull(),

    // timing
    startedAt: timestamp(timestampConfig),
    finishedAt: timestamp(timestampConfig),
    lastHeartbeatAt: timestamp(timestampConfig),

    // progress (live counters — updated as job runs)
    // total items planned (e.g. total conversations)
    totalScan: integer().notNull().default(0),
    // items processed so far
    currentScan: integer().notNull().default(0),
    // human-readable: "listing conversations" | "page 3/12" | "flushing batch 5"
    currentStep: text(),
    // Messenger sync uses this as the timestamp watermark of the OLDEST
    // message.created_time processed so far. Drives within-run chunk resume
    // (next chunk skips conversations newer than this) AND cross-run resume
    // (next run derives its ceiling from the prior run's lastSyncedAt when
    // status === 'partial', or from startedAt when status === 'succeeded').
    // Survives Page access-token rotation — unlike the prior Graph `after`
    // cursor it replaced. Null on a fresh run that hasn't processed anything.
    lastSyncedAt: timestamp(timestampConfig),
    // WhatsApp coexist flush handler uses this as a batch counter for
    // continuation jobId uniqueness and human-readable progress.
    currentPageNumber: integer().notNull().default(0),

    // outcome counters
    importedContactCount: integer().notNull().default(0),
    importedMessageCount: integer().notNull().default(0),
    skippedCount: integer().notNull().default(0),
    failedCount: integer().notNull().default(0),
    attempts: integer().notNull().default(0),

    // last error message (text only, no stack)
    currentError: text(),

    // Meta history sync metadata (per docs: value.history[].metadata).
    // phase: 0 = day 0–1, 1 = day 1–90, 2 = day 90–180 (terminal).
    // chunkOrder/syncProgress drive UI completion signal — syncProgress=100
    // means Meta finished pushing history for this run.
    lastPhase: integer(),
    lastChunkOrder: integer(),
    syncProgress: integer().notNull().default(0),

    // Messenger 2-phase sync state. Phase 1 ("contacts") walks
    // /conversations and bulk-upserts contacts; phase 2 ("messages") re-walks
    // /conversations to fetch + persist messages per conv. lastSyncedAt is
    // reset to null on phase transition so phase 2 starts from newest.
    messengerSyncPhase: coexistMessengerSyncPhase()
      .notNull()
      .default("contacts"),

    // WhatsApp coexist: patches Meta delivered before the message they target.
    // Nullable with NO `.default()` on purpose (see AGENTS.md "phantom jsonb
    // defaults") — every insert path writes it explicitly.
    pendingPatches: jsonb().$type<PendingCoexistPatches>(),

    // Exclusive-ownership token, re-minted by every claim. `status = 'running'`
    // cannot distinguish the worker that holds the run from one whose claim was
    // taken over after a stale heartbeat — both see `running`. Every write a
    // claim holder makes is additionally conditional on this token, so the
    // moment a second worker claims, the first worker's writes affect 0 rows
    // and it abandons (see `coexistWhatsappFlush`).
    //
    // Nullable with NO `.default()` on purpose (AGENTS.md "phantom defaults")
    // — `createRun` writes it explicitly. NULL means "never claimed".
    claimToken: text(),

    // Contact-scan-only columns below. NULL for `type = 'coexist'` rows.

    // Scan lower bound: the operator-picked "scan inbox from" time, and the
    // walk ceiling the engine stops at (the same role `startedAt`/prior-run
    // `lastSyncedAt` plays for coexist's `findResumeCeiling`).
    scanFromAt: timestamp(timestampConfig),
    // The user who requested the scan (v1's `user_id`). `set null` so
    // deleting the user does not cascade into losing scan history.
    requestedByUserId: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // Provider `after` cursor of the next page, persisted every progress
    // write so a continuation resumes from where it left off instead of
    // re-walking page 1. Cleared on terminal write. Coexist keeps its cursor
    // in memory, unchanged — this column is scan-only.
    resumeCursor: text(),
  },
  (t) => [
    index("CoexistSyncRun_workspace_idx").on(t.workspaceId),
    index("CoexistSyncRun_integration_idx").on(t.integrationId),
    index("CoexistSyncRun_active_idx")
      .on(t.status, t.lastHeartbeatAt)
      .where(sql`status IN ('init', 'running')`),
    // Composite partial index that powers fetchPriorRunCeiling in coexist
    // messenger-sync. The query filters by (integrationId, channel) restricted
    // to status IN ('succeeded','partial') and asks for the most recent
    // startedAt. Without this index every chunk pays a per-integration sort.
    index("CoexistSyncRun_integration_resume_idx")
      .on(t.integrationId, t.channel, sql`${t.startedAt} DESC`)
      .where(sql`status IN ('succeeded', 'partial')`),
    // Prevent duplicate init rows when coexist is toggled rapidly on the same
    // (integration, channel). Scheduler INSERT race → second row would never
    // get claimed and would clutter the table. Scoped to `type = 'coexist'`
    // so a scan `init` row on the same (integrationId, messenger) does not
    // collide with a coexist `init` row — they are independent lifecycles
    // sharing this table.
    uniqueIndex("CoexistSyncRun_integration_init_uq")
      .on(t.integrationId, t.channel)
      .where(sql`status = 'init' AND type = 'coexist'`),
    // v1's one-active-scan rule: at most one live (init/running) scan per
    // integration (inbox ↔ integration is 1:1 per channel).
    uniqueIndex("CoexistSyncRun_contact_scan_active_uq")
      .on(t.integrationId)
      .where(sql`type = 'contact_scan' AND status IN ('init', 'running')`),
    // Powers the scan sweeper's `pickDueRuns({ type: 'contact_scan' })`.
    index("CoexistSyncRun_contact_scan_due_idx")
      .on(t.type, t.status, t.createdAt)
      .where(sql`type = 'contact_scan'`),
  ],
)
