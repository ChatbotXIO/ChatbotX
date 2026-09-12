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
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import {
  type WhatsappCallDirection,
  type WhatsappCallStatus,
  whatsappCallDirections,
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

/**
 * One row per WhatsApp Business call.
 *
 * Two independent, decoupled identifiers can each name this row before the
 * other is known:
 * - `wacid` — Meta's call id, learned from an INVITE/BYE header or a
 *   `call_created`/`terminate` webhook. Nullable: an FreeSWITCH-created row
 *   may never see it (e.g. the webhook is delayed or lost).
 * - `freeswitchUuid` — the FreeSWITCH A-leg channel uuid (`Unique-ID`) that
 *   ran the dialplan and `record_session`. Nullable: an outbound row is
 *   inserted by the action before FreeSWITCH creates any channel.
 * `attemptId` is a locally-minted id (cuid) FreeSWITCH always carries via
 * the `X-CBX-Attempt` header / `cbx_attempt_id` channel var for outbound
 * calls; inbound rows mint one too so every FreeSWITCH-created row has one,
 * but pre-migration webhook-only rows never will — hence nullable.
 * `whatsappCallRepository.upsertInbound`/`createFromFreeswitch`/`attachWacid`
 * reconcile whichever identifier arrives first onto a single row (see
 * `packages/business/src/whatsapp-call/call-row-service.ts`).
 */
export const whatsappCallModel = pgTable(
  "WhatsappCall",
  {
    ...sharedColumns,
    /** Meta call id ("wacid...."). Nullable — see file doc comment. */
    wacid: text(),
    /** Locally-minted attempt id, set for every row FreeSWITCH creates. */
    attemptId: text(),
    direction: whatsappCallDirection().$type<WhatsappCallDirection>().notNull(),
    status: whatsappCallStatus()
      .$type<WhatsappCallStatus>()
      .notNull()
      .default("ringing"),
    startedAt: timestamp(timestampConfig),
    endedAt: timestamp(timestampConfig),
    durationSeconds: integer(),
    /**
     * The call-activity message rendered into the conversation on terminate.
     * Plain column, no FK — `Message` is a sharded hypertable without inbound
     * foreign keys by design.
     */
    messageId: bigintAsString(),
    /**
     * FreeSWITCH A-leg channel uuid (the root channel that ran the dialplan
     * and `record_session`) carrying this call's audio. Unique when
     * non-null.
     */
    freeswitchUuid: text(),
    /**
     * The bridged leg's uuid (Meta leg outbound / answering agent leg
     * inbound) — used for `uuid_kill` and reading BYE headers. Not unique: a
     * re-bridge (e.g. re-ringing a new agent) may replace it.
     */
    freeswitchBLegUuid: text(),
    /** Last error observed for this call (hangup cause detail, dial failure, reconciliation note). */
    lastError: text(),
    /** The agent user whose leg answered the call, if any. */
    answeredByUserId: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** Object-storage path of the call recording. */
    recordingPath: text(),
    recordedAt: timestamp(timestampConfig),
    /** Speech-to-text transcript of the recording. */
    transcript: text(),
    transcribedAt: timestamp(timestampConfig),
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
    // Partial: only FreeSWITCH-created rows carry an attemptId.
    uniqueIndex("WhatsappCall_attemptId_key")
      .using("btree", table.attemptId.asc().nullsLast())
      .where(sql`"attemptId" IS NOT NULL`),
    // Partial unique: the only column every FreeSWITCH-side job shares, and
    // the canonical `ON CONFLICT` target for `createFromFreeswitch`.
    uniqueIndex("WhatsappCall_freeswitchUuid_key")
      .using("btree", table.freeswitchUuid.asc().nullsLast())
      .where(sql`"freeswitchUuid" IS NOT NULL`),
    // Non-unique: a re-bridge may point a second leg at the same call.
    index("WhatsappCall_freeswitchBLegUuid_idx")
      .using("btree", table.freeswitchBLegUuid.asc().nullsLast())
      .where(sql`"freeswitchBLegUuid" IS NOT NULL`),
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
    index("WhatsappCall_workspaceId_createdAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.createdAt.desc(),
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
    // One live outbound attempt per (inbox, contact) at a time — the guard
    // `startWhatsappCallAction` relies on to refuse a second concurrent dial.
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
