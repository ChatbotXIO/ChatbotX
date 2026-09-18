import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { commentAutomationMissReasons } from "../partials/comment-automation-miss"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { commentAutomationModel } from "./comment-automation"
import { contactModel } from "./contact"
import { contactInboxModel } from "./contact-inbox"
import { workspaceModel } from "./workspace"

export const commentAutomationMissReason = pgEnum(
  "commentAutomationMissReason",
  commentAutomationMissReasons.options as [string, ...string[]],
)

/**
 * Append-only log of comments an automation was shown and declined to answer —
 * the Misses column and the drill-down behind it.
 *
 * Deliberately NOT `CommentAutomationEvent`. Three reasons:
 *
 * - That table is unique on `(automationId, commentId, replyChannel)` and its
 *   `replyChannel`/`replyType` are `NOT NULL`; a miss has neither, because no
 *   branch was ever chosen.
 * - Every analytics-page query (the replies series, the user-comment and
 *   bot-reply panels, Error Logs) aggregates that table directly. Mixing a row
 *   type none of them want in would mean auditing all of them forever after.
 * - Volume. `findActiveAutomations` scopes by workspace + channel, not by post,
 *   so one comment is shown to EVERY active automation of that channel and
 *   misses outnumber replies by however many automations the workspace runs.
 *   Keeping them out of the analytics table is what keeps that table fast.
 *
 * **These rows are never purged.** `CommentAutomationEvent`'s failed rows
 * have a 30-day window; misses are kept for the life of the automation by an
 * explicit product decision, so the drill-down can always explain the counter.
 * If that ever has to change, `purgeFailedCommentAutomationEvents` is the
 * pattern to copy — and it needs its own partial index, the way that one does.
 *
 * One row per `(automationId, commentId)`: an automation sees a given comment
 * once and declines it for exactly one reason (the first gate that rejects it).
 * The unique index makes a BullMQ retry or a redelivered webhook idempotent via
 * `onConflictDoNothing`, which is what keeps `CommentAutomation.missedCount`
 * exact — the counter moves per row actually returned, never per call.
 */
export const commentAutomationMissModel = pgTable(
  "CommentAutomationMiss",
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
     * The inbox the comment arrived on. The drill-down dialog hydrates names,
     * avatars and the conversation link from it, exactly as the delivery-stat
     * dialog does — a row without one cannot be rendered and is filtered out.
     */
    contactInboxId: bigintAsString().references(() => contactInboxModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    postId: text().notNull(),
    commentId: text().notNull(),
    /** The customer's comment. Null for an image/sticker-only comment. */
    commentText: text(),
    reason: commentAutomationMissReason().notNull(),
    /**
     * When the customer commented (from the webhook's `createdTime`), not when
     * this row was written. That is what the dialog shows next to the text.
     */
    occurredAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [
    // Natural key: makes a job retry a no-op via `onConflictDoNothing`.
    uniqueIndex("CommentAutomationMiss_dedup_idx").on(
      table.automationId,
      table.commentId,
    ),
    // The drill-down: one automation, newest first. Mirrors
    // `CommentAutomationEvent_automation_occurredAt_idx`.
    index("CommentAutomationMiss_automation_occurredAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.automationId.asc().nullsLast(),
      table.occurredAt.desc().nullsFirst(),
    ),
    // Serves the `onDelete: "set null"` FK scan Postgres runs on every
    // `Contact` delete, like every comparable contactId FK in the schema.
    index("CommentAutomationMiss_contactId_idx").on(table.contactId),
    // Same FK-scan duty for `ContactInbox` deletes.
    index("CommentAutomationMiss_contactInboxId_idx").on(table.contactInboxId),
  ],
)
