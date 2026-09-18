import { sql } from "drizzle-orm"
import {
  boolean,
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
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import {
  type WhatsappCallAiSummary,
  type WhatsappCallDirection,
  type WhatsappCallOutcome,
  type WhatsappCallStatus,
  type WhatsappCallTranscriptSegments,
  whatsappCallDirections,
  whatsappCallOutcomes,
  whatsappCallStatuses,
} from "../partials/whatsapp-call"
import { userModel } from "./auth-user"
import { contactInboxModel } from "./contact-inbox"
import { conversationModel } from "./conversation"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const whatsappCallDirection = pgEnum(
  "whatsappCallDirection",
  whatsappCallDirections.options as [string, ...string[]],
)

export const whatsappCallStatus = pgEnum(
  "whatsappCallStatus",
  whatsappCallStatuses.options as [string, ...string[]],
)

export const whatsappCallOutcome = pgEnum(
  "whatsappCallOutcome",
  whatsappCallOutcomes.options as [string, ...string[]],
)

/**
 * One row per WhatsApp Business call.
 *
 * Two independent identifiers can each name this row before the other is
 * known, so both are nullable:
 * - `wacid` — Meta's call id, learned from a `connect`/`terminate` webhook.
 *   An outbound row is inserted at dial time and only learns its wacid when
 *   Meta answers or reports the call.
 * - `attemptId` — a locally-minted id the outbound dial carries through
 *   Meta's `biz_opaque_callback_data`, so an answer/terminate webhook can be
 *   matched back to the attempt that placed the call before a wacid exists.
 *
 * `whatsappCallRepository.attachWacid` reconciles whichever identifier
 * arrives first onto a single row.
 */
export const whatsappCallModel = pgTable(
  "WhatsappCall",
  {
    ...sharedColumns,
    /** Meta call id ("wacid...."). Nullable — see file doc comment. */
    wacid: text(),
    /** Locally-minted attempt id — see file doc comment. */
    attemptId: text(),
    direction: whatsappCallDirection().$type<WhatsappCallDirection>().notNull(),
    status: whatsappCallStatus()
      .$type<WhatsappCallStatus>()
      .notNull()
      .default("ringing"),
    /**
     * Display outcome for a terminal {@link status}, written together with
     * every terminal status write (`resolveWhatsappCallOutcome`,
     * `partials/whatsapp-call.ts`). `null` for a non-terminal row
     * (ringing/accepted) and for a legacy terminal row until the backfill
     * migration fills it.
     */
    outcome: whatsappCallOutcome().$type<WhatsappCallOutcome>(),
    startedAt: timestamp(timestampConfig),
    endedAt: timestamp(timestampConfig),
    durationSeconds: integer(),
    /**
     * The call-activity message rendered into the conversation on terminate.
     * Plain column, no FK — `Message` is a sharded hypertable without inbound
     * foreign keys by design.
     */
    messageId: bigintAsString(),
    /** Last error observed for this call (hangup cause detail, dial failure, reconciliation note). */
    lastError: text(),
    /** The agent user whose leg answered the call, if any. */
    answeredByUserId: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /**
     * The agent user who PLACED an outbound (`businessInitiated`) call —
     * `answeredByUserId` only covers who answered an INBOUND call, so an
     * outbound call needs its own column to label the "Business" speaker in
     * the Call Information sheet. Nullable: absent for inbound calls and
     * for outbound calls with no identifiable initiating agent (e.g. a
     * legacy row predating this column).
     */
    initiatedByUserId: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /**
     * Whether THIS call actually arranged a recording, as opposed to the
     * number's "Record calls" toggle. Meta only records after it plays its
     * consent announcement, and it rejects the announcement outright when the
     * `purpose`/`announcement_language` are invalid — so the toggle alone can
     * never tell the agent whether audio is coming. `null` on rows written
     * before this column existed; the card then falls back to the toggle.
     */
    recordingRequested: boolean(),
    /**
     * Why no recording was arranged, when {@link recordingRequested} is
     * false — surfaced on the call card and recorded in the workspace's
     * error log, so aconfiguration mistake is never silently swallowed.
     */
    recordingFailureReason: text(),
    /** Object-storage path of the call recording. */
    recordingPath: text(),
    recordedAt: timestamp(timestampConfig),
    /**
     * Speech-to-text transcript of the recording, flat (no speaker/timing
     * breakdown) — backs `{{last_call_transcript}}` and text search.
     */
    transcript: text(),
    transcribedAt: timestamp(timestampConfig),
    /**
     * Timestamped (and, for a Meta-native VoIP transcript, diarized)
     * segments of {@link transcript} — see
     * `WhatsappCallTranscriptSegment` (`partials/whatsapp-call.ts`) for the
     * per-entry shape. Additive alongside the flat `transcript` column,
     * never a replacement for it.
     */
    transcriptSegments: jsonb().$type<WhatsappCallTranscriptSegments>(),
    /** On-demand AI-generated summary of the transcript — ours; Meta has no equivalent. */
    aiSummary: jsonb().$type<WhatsappCallAiSummary>(),
    aiSummarizedAt: timestamp(timestampConfig),
    /** Which connected AI integration (OpenAI, Claude, Gemini, …) produced {@link aiSummary}. */
    aiSummaryProvider: text(),
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
    contactInboxId: bigintAsString()
      .notNull()
      .references(() => contactInboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    conversationId: bigintAsString()
      .notNull()
      .references(() => conversationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    // Partial: `wacid` is learned asynchronously (webhook or BYE header), so
    // a row can exist with it still null; only rows that DO have one must be
    // globally unique.
    uniqueIndex("WhatsappCall_wacid_key")
      .using("btree", table.wacid.asc().nullsLast())
      .where(sql`"wacid" IS NOT NULL`),
    // Partial: only outbound rows carry an attemptId.
    uniqueIndex("WhatsappCall_attemptId_key")
      .using("btree", table.attemptId.asc().nullsLast())
      .where(sql`"attemptId" IS NOT NULL`),
    index("WhatsappCall_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("WhatsappCall_conversationId_idx").using(
      "btree",
      table.conversationId.asc().nullsLast(),
    ),
    index("WhatsappCall_contactInboxId_idx").using(
      "btree",
      table.contactInboxId.asc().nullsLast(),
    ),
    // Call log page: cursor-paginated `(createdAt, id)` scan per workspace.
    // `id desc` is the tie-breaker for rows sharing the same `createdAt`
    // (bulk backfills, high-volume workspaces), so the cursor is stable.
    index("WhatsappCall_workspaceId_createdAt_id_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.createdAt.desc(),
      table.id.desc(),
    ),
    // Contact panel: cursor-paginated `(createdAt, id)` scan per contact.
    index("WhatsappCall_contactInboxId_createdAt_idx").using(
      "btree",
      table.contactInboxId.asc().nullsLast(),
      table.createdAt.desc(),
    ),
    // Sweeper (`sweepStaleRinging`): finds stuck `ringing` rows without
    // scanning the whole table.
    index("WhatsappCall_ringing_createdAt_idx")
      .using("btree", table.createdAt.asc().nullsLast())
      .where(sql`"status" = 'ringing'`),
    // Inbox resume-after-refresh (`findRingingByWorkspace`): runs on every
    // inbox open, so it reads only the newest resumable ringing rows.
    index("WhatsappCall_resumableRinging_idx")
      .using(
        "btree",
        table.workspaceId.asc().nullsLast(),
        table.createdAt.desc(),
      )
      .where(
        sql`"status" = 'ringing' AND "wacid" IS NOT NULL AND "answeredByUserId" IS NULL`,
      ),
    // Recording retention sweep (`listRecordingsPastRetention`): recorded rows
    // per inbox by age, so each integration's cutoff is an index range scan.
    index("WhatsappCall_recording_inboxId_recordedAt_idx")
      .using(
        "btree",
        table.inboxId.asc().nullsLast(),
        table.recordedAt.asc().nullsLast(),
      )
      .where(sql`"recordingPath" IS NOT NULL`),
    // One live outbound attempt per (inbox, contact) at a time — the guard
    // `initiateOutboundVoipCallAction` relies on to refuse a second concurrent dial.
    uniqueIndex("WhatsappCall_pendingOutbound_key")
      .using(
        "btree",
        table.inboxId.asc().nullsLast(),
        table.contactInboxId.asc().nullsLast(),
      )
      .where(
        sql`"direction" = 'businessInitiated' AND "status" IN ('ringing', 'accepted')`,
      ),
  ],
)
