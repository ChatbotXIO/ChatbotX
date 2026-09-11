import { sql } from "drizzle-orm"
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { fbCommentReplyTypes } from "../partials/fb-comment-automation"
import {
  commentAutomationEventStatuses,
  commentAutomationReplyChannels,
} from "../partials/fb-comment-automation-event"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { contactModel } from "./contact"
import { contactInboxModel } from "./contact-inbox"
import { fbCommentAutomationModel } from "./fb-comment-automation"
import { workspaceModel } from "./workspace"

export const commentAutomationReplyChannel = pgEnum(
  "commentAutomationReplyChannel",
  commentAutomationReplyChannels.options as [string, ...string[]],
)

export const commentAutomationReplyType = pgEnum(
  "commentAutomationReplyType",
  fbCommentReplyTypes.options as [string, ...string[]],
)

export const commentAutomationEventStatus = pgEnum(
  "commentAutomationEventStatus",
  commentAutomationEventStatuses.options as [string, ...string[]],
)

/**
 * Append-only log of every reply a comment automation actually attempted — the
 * only source the per-automation analytics page has.
 *
 * `FBCommentAutomationReply` cannot serve this: it is a dedup key, unique on
 * `(automationId, contactId, postId)`, so it holds at most one row per contact
 * per post and carries no text, no reply timestamp and no outcome. `Message`
 * carries the comment and public-reply text but has no `automationId`, and a
 * private DM writes no `Message` row at all.
 *
 * One row per `(automationId, commentId, replyChannel)`: a single comment can
 * draw both a public reply and a private DM, each with its own outcome. The
 * unique index makes a BullMQ retry idempotent via `onConflictDoNothing`, so
 * re-delivery never inflates the counts.
 */
export const fbCommentAutomationEventModel = pgTable(
  "FBCommentAutomationEvent",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    automationId: bigintAsString()
      .notNull()
      .references(() => fbCommentAutomationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString().references(() => contactModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /**
     * The inbox the reply went to. Required for the read receipt: Meta's
     * `message_reads` webhook identifies the reader by PSID only, and a private
     * text DM leaves no `Message` row to join through — it goes straight out
     * via `PRIVATE_REPLY_TEXT_SENDERS`. `contactId` cannot stand in: one contact
     * can hold several inboxes.
     */
    contactInboxId: bigintAsString().references(() => contactInboxModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    postId: text().notNull(),
    commentId: text().notNull(),
    /** The customer's comment. Null for an image/sticker-only comment. */
    commentText: text(),
    replyChannel: commentAutomationReplyChannel().notNull(),
    replyType: commentAutomationReplyType().notNull(),
    /**
     * What the bot actually sent, after variable substitution — that is what
     * the "Bot replies to comments" table groups on. A `flow` reply has no text
     * of its own so it stores the flow's name; an `AIAgent` reply starts null
     * and is filled in by `processCommentAIReply` once the text exists.
     */
    replyText: text(),
    status: commentAutomationEventStatus().notNull(),
    /**
     * Delivery timeline, mirroring `ContactOnBroadcast`. Four independent
     * timestamps rather than more `status` values, because the outcomes are not
     * a linear progression: a reply can be delivered and clicked, or delivered
     * and only later reported failed.
     *
     * Each is written with `COALESCE`/`WHERE <col> IS NULL` so the first event
     * wins and a redelivered webhook is a no-op — that is also what keeps the
     * lifetime counters on `FBCommentAutomation` from double-counting.
     *
     * `deliveredAt` means the channel accepted the send (Graph API returned
     * OK); Meta reports no delivery receipt for a public comment reply, so this
     * is the only delivery signal available for the `public` channel.
     * `seenAt` is `private` only — a public comment has no read receipt.
     */
    deliveredAt: timestamp(timestampConfig),
    seenAt: timestamp(timestampConfig),
    clickedAt: timestamp(timestampConfig),
    failedAt: timestamp(timestampConfig),
    errorDetail: text(),
    httpCode: text(),
    /**
     * When the customer commented (from the webhook's `createdTime`), not when
     * this row was written — `replyAfter` can delay the reply by up to an hour,
     * so the two genuinely differ. Every analytics query buckets on this.
     */
    occurredAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [
    // Natural event key: makes a job retry a no-op via `onConflictDoNothing`.
    uniqueIndex("FBCommentAutomationEvent_dedup_idx").on(
      table.automationId,
      table.commentId,
      table.replyChannel,
    ),
    // Serves every analytics query: one automation, date-bounded, newest first.
    index("FBCommentAutomationEvent_automation_occurredAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.automationId.asc().nullsLast(),
      table.occurredAt.desc().nullsFirst(),
    ),
    // Serves the `onDelete: "set null"` FK scan Postgres runs on every
    // `Contact` delete, like every comparable contactId FK in the schema.
    index("FBCommentAutomationEvent_contactId_idx").on(table.contactId),
    // Same FK-scan duty for `ContactInbox` deletes.
    index("FBCommentAutomationEvent_contactInboxId_idx").on(
      table.contactInboxId,
    ),
    // The read-receipt lookup, which runs for EVERY `message:seen` event on the
    // platform — a read receipt carries no automation id, so the only way in is
    // the inbox. Partial, like `ContactOnBroadcast_unsent_idx`: the rows that
    // can still be marked seen are a vanishing fraction of the table.
    index("FBCommentAutomationEvent_private_unseen_idx")
      .on(table.contactInboxId)
      .where(
        sql`"replyChannel" = 'private' AND "deliveredAt" IS NOT NULL AND "seenAt" IS NULL`,
      ),
    // Serves the `purgeCommentAutomationEvents` retention cron's age scan.
    index("FBCommentAutomationEvent_createdAt_idx").using(
      "btree",
      table.createdAt.asc().nullsLast(),
    ),
  ],
)
