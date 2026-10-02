import { sql } from "drizzle-orm"
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type AiHandoverBulkAction,
  type AiHandoverBulkStatus,
  type AiHandoverChannel,
  aiHandoverBulkActions,
  aiHandoverBulkStatuses,
} from "../partials/ai-handover"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const aiHandoverBulkActionEnum = pgEnum(
  "aiHandoverBulkAction",
  aiHandoverBulkActions.options as [
    AiHandoverBulkAction,
    ...AiHandoverBulkAction[],
  ],
)

export const aiHandoverBulkStatusEnum = pgEnum(
  "aiHandoverBulkStatus",
  aiHandoverBulkStatuses.options as [
    AiHandoverBulkStatus,
    ...AiHandoverBulkStatus[],
  ],
)

/**
 * One "apply to all customers" run of a Page: hands every eligible thread of
 * the Page to the AI agent (`enable`) or takes the AI-held ones back with a
 * tagged message (`disable`). Executed as short chunk jobs; this row is the
 * durable cursor, the lease and the history shown to the admin. No jsonb and
 * no `.default()` on purpose (AGENTS.md "phantom defaults"): every insert
 * writes every column.
 */
export const aiHandoverBulkRunModel = pgTable(
  "AIHandoverBulkRun",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigintAsString()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    channel: text().$type<AiHandoverChannel>().notNull(),
    // The `AiHandoverSettings.applyToAllRevision` this run serves: at most one
    // run per revision, so a revision is never executed twice.
    revision: integer().notNull(),
    action: aiHandoverBulkActionEnum().notNull(),
    status: aiHandoverBulkStatusEnum().notNull(),
    // Disable only: the text sent with the HUMAN_AGENT tag. NULL for enable.
    message: text(),
    // `set null` so deleting the user keeps the history.
    requestedByUserId: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // Eligibility cut-off: a thread changed after this (a human took over) is
    // respected and skipped.
    requestedAt: timestamp(timestampConfig).notNull(),
    startedAt: timestamp(timestampConfig),
    finishedAt: timestamp(timestampConfig),
    lastHeartbeatAt: timestamp(timestampConfig),
    // The channel asked to wait out its quota: nothing may claim or re-dispatch
    // the run before this. A cancel bypasses it. NULL = not paused.
    pausedUntil: timestamp(timestampConfig),
    // Exclusive lease token, re-minted by every claim; every write a claim
    // holder makes is conditional on it. NULL = released / never claimed.
    claimToken: text(),
    // Sweeper dispatches burned (a continuation chunk is not an attempt).
    attempts: integer().notNull(),
    // Monotonic continuation revision; makes each chunk job id unique.
    chunkSeq: integer().notNull(),
    // Counted when the run starts, rewritten with the sum of outcomes at the end.
    totalCount: integer(),
    processedCount: integer().notNull(),
    skippedCount: integer().notNull(),
    failedCount: integer().notNull(),
    // Keyset cursor: the last contact-inbox id of the Page that was settled.
    cursorContactInboxId: text(),
    // Durable batch markers: set before the Graph call, cleared on settle. A
    // disable recovering with them set skips the range (under-send, never
    // double-send).
    inFlightFromId: text(),
    inFlightToId: text(),
    currentError: text(),
  },
  (t) => [
    // One live run per Page.
    uniqueIndex("AIHandoverBulkRun_inbox_live_uq")
      .on(t.inboxId)
      .where(sql`status IN ('pending', 'running', 'cancelling')`),
    // One run per desired-state revision of a Page: the reconcile backstop.
    uniqueIndex("AIHandoverBulkRun_inbox_revision_uq").on(
      t.inboxId,
      t.revision,
    ),
    index("AIHandoverBulkRun_workspace_idx").on(t.workspaceId),
    index("AIHandoverBulkRun_inbox_createdAt_idx").on(
      t.inboxId,
      sql`${t.createdAt} DESC`,
    ),
    index("AIHandoverBulkRun_live_idx")
      .on(t.status, t.lastHeartbeatAt)
      .where(sql`status IN ('pending', 'running', 'cancelling')`),
    index("AIHandoverBulkRun_requestedByUserId_idx").on(t.requestedByUserId),
  ],
)
