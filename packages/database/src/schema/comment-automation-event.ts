import { sql } from "drizzle-orm"
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { commentReplyTypes } from "../partials/comment-automation"
import {
  commentAutomationEventStatuses,
  commentAutomationReplyChannels,
} from "../partials/comment-automation-event"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { commentAutomationModel } from "./comment-automation"
import { contactModel } from "./contact"
import { contactInboxModel } from "./contact-inbox"
import { workspaceModel } from "./workspace"

export const commentAutomationReplyChannel = pgEnum(
  "commentAutomationReplyChannel",
  commentAutomationReplyChannels.options as [string, ...string[]],
)

export const commentAutomationReplyType = pgEnum(
  "commentAutomationReplyType",
  commentReplyTypes.options as [string, ...string[]],
)

export const commentAutomationEventStatus = pgEnum(
  "commentAutomationEventStatus",
  commentAutomationEventStatuses.options as [string, ...string[]],
)

/**
 * Append-only log of every reply a comment automation actually attempted — the
 * only source the per-automation analytics page has.
 *
 * `CommentAutomationReply` cannot serve this: it is a dedup key, unique on
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
export const commentAutomationEventModel = pgTable(
  "CommentAutomationEvent",
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
      .references(() => commentAutomationModel.id, {
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
     * lifetime counters on `CommentAutomation` from double-counting.
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
    uniqueIndex("CommentAutomationEvent_dedup_idx").on(
      table.automationId,
      table.commentId,
      table.replyChannel,
    ),
    // Serves every analytics query: one automation, date-bounded, newest first.
    index("CommentAutomationEvent_automation_occurredAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.automationId.asc().nullsLast(),
      table.occurredAt.desc().nullsFirst(),
    ),
    // Serves the `onDelete: "set null"` FK scan Postgres runs on every
    // `Contact` delete, like every comparable contactId FK in the schema.
    index("CommentAutomationEvent_contactId_idx").on(table.contactId),
    // Same FK-scan duty for `ContactInbox` deletes.
    index("CommentAutomationEvent_contactInboxId_idx").on(table.contactInboxId),
    // The read-receipt lookup, which runs for EVERY `message:seen` event on the
    // platform — a read receipt carries no automation id, so the only way in is
    // the inbox. Partial, like `ContactOnBroadcast_unsent_idx`: the rows that
    // can still be marked seen are a vanishing fraction of the table.
    index("CommentAutomationEvent_private_unseen_idx")
      .on(table.contactInboxId)
      .where(
        sql`"replyChannel" = 'private' AND "deliveredAt" IS NOT NULL AND "seenAt" IS NULL`,
      ),
    // Serves the `purgeFailedCommentAutomationEvents` retention cron's age
    // scan. Partial on purpose: only failed rows are ever purged, and the
    // successful ones — kept for the life of the automation — would otherwise
    // form an ever-growing prefix the oldest-first select has to walk past on
    // every run.
    index("CommentAutomationEvent_failed_createdAt_idx")
      .using("btree", table.createdAt.asc().nullsLast())
      .where(sql`"status" = 'failed'`),
  ],
)
