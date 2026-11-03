import { sql } from "drizzle-orm"
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type CommentModerationCategory,
  commentModerationActions,
} from "../partials/comment-automation"
import {
  commentModerationRules,
  commentModerationSources,
  commentModerationStatuses,
} from "../partials/comment-moderation-log"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { commentAutomationModel } from "./comment-automation"
import { contactModel } from "./contact"
import { contactInboxModel } from "./contact-inbox"
import { workspaceModel } from "./workspace"

export const commentModerationSource = pgEnum(
  "commentModerationSource",
  commentModerationSources.options as [string, ...string[]],
)

export const commentModerationRule = pgEnum(
  "commentModerationRule",
  commentModerationRules.options as [string, ...string[]],
)

export const commentModerationAction = pgEnum(
  "commentModerationAction",
  commentModerationActions.options as [string, ...string[]],
)

export const commentModerationStatus = pgEnum(
  "commentModerationStatus",
  commentModerationStatuses.options as [string, ...string[]],
)

/**
 * Append-only log of comments a comment automation hid or deleted, and why —
 * by a hide rule (`source = rule`, `rule` says which) or by AI moderation
 * (`source = ai`, `categories` + `reason` are the model's verdict).
 *
 * Keeps `commentText` because a deleted comment is gone from the channel and
 * from the inbox: this row is the only record of what was removed.
 *
 * **No retention purge** — an explicit product decision, like
 * `CommentAutomationMiss`: rows live as long as their automation. They are
 * only drained with the workspace (`HEAVY_WORKSPACE_TABLES`). If a retention
 * window is ever wanted, copy `purgeFailedCommentAutomationEvents` and give it
 * its own index.
 *
 * One row per `(automationId, commentId)`: the unique index makes a BullMQ
 * retry or a redelivered webhook idempotent via `onConflictDoNothing`, which
 * keeps `CommentAutomation.moderatedCount` exact.
 */
export const commentModerationLogModel = pgTable(
  "CommentModerationLog",
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
    contactInboxId: bigintAsString().references(() => contactInboxModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    postId: text().notNull(),
    commentId: text().notNull(),
    /** The customer's comment. Null for an image/sticker-only comment. */
    commentText: text(),
    source: commentModerationSource().notNull(),
    /** The hide rule that matched. Null on an `ai` row. */
    rule: commentModerationRule(),
    /** The `hideComments.keywords` entry that matched a `keyword` rule. */
    matchedKeyword: text(),
    /** The AI's categories, from `commentModerationCategories`. */
    categories: text()
      .array()
      .$type<CommentModerationCategory>()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** The AI's one-sentence explanation. Null on a `rule` row. */
    reason: text(),
    action: commentModerationAction().notNull(),
    status: commentModerationStatus().notNull().default("pending"),
    errorDetail: text(),
    provider: text(),
    modelId: text(),
    /** When the customer commented, not when this row was written. */
    occurredAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [
    uniqueIndex("CommentModerationLog_dedup_idx").on(
      table.automationId,
      table.commentId,
    ),
    // The log list: one automation, newest first. Leads with `workspaceId`
    // so the workspace purge drain can use it too.
    index("CommentModerationLog_workspace_automation_occurredAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.automationId.asc().nullsLast(),
      table.occurredAt.desc().nullsFirst(),
    ),
    index("CommentModerationLog_contactId_idx")
      .on(table.contactId)
      .where(sql`${table.contactId} IS NOT NULL`),
    index("CommentModerationLog_contactInboxId_idx")
      .on(table.contactInboxId)
      .where(sql`${table.contactInboxId} IS NOT NULL`),
  ],
)
