import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
} from "drizzle-orm/pg-core"
import {
  type CommentHideComments,
  type CommentIncludeKeywords,
  type CommentOptions,
  type CommentPost,
  type CommentReply,
  type CommentReplyAfter,
  commentAutomationTypes,
} from "../partials/comment-automation"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { folderModel } from "./folder"
import { workspaceModel } from "./workspace"

export const commentAutomationType = pgEnum(
  "commentAutomationType",
  commentAutomationTypes.options as [string, ...string[]],
)

export const commentAutomationModel = pgTable(
  "CommentAutomation",
  {
    ...sharedColumns,
    name: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    folderId: bigintAsString().references(() => folderModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    type: commentAutomationType().notNull().default("messenger"),
    isActive: boolean().notNull().default(true),
    startTime: text(),
    endTime: text(),
    repliesCount: integer().notNull().default(0),
    /**
     * Lifetime delivery counters, deliberately separate from
     * `CommentAutomationEvent`: that table's FAILED rows are purged after
     * `COMMENT_AUTOMATION_ERROR_RETENTION_DAYS`, so aggregating it would make
     * `failedCount` (and the percentages measured against it) silently shrink
     * every night.
     *
     * The event row's `deliveredAt`/`seenAt`/`clickedAt`/`failedAt` columns are
     * what keeps these exact — every increment is paired with a conditional
     * `UPDATE ... WHERE <col> IS NULL RETURNING`, so a redelivered webhook or a
     * BullMQ retry moves the timestamp zero times and the counter with it.
     *
     * `sentCount` counts reply *attempts* (one per event row), which is
     * `deliveredCount + failedCount` in the steady state — the same relation
     * broadcast derives on the fly. It is NOT `repliesCount`: one comment
     * answered both publicly and privately is 1 reply but 2 attempts.
     *
     * Which half of the comment they measure is decided by the CHANNEL, not by
     * the automation's configuration (`countsTowardStats` in
     * `packages/analytics`): the DM where the channel has a comment-anchored
     * one, the public comment reply on Threads, which has none. TikTok used to
     * belong to the second group and moved to the first when Comment-to-Message
     * shipped. `seenCount`/`clickedCount` stay zero on Threads — a comment
     * reply has no read receipt and carries no button — so their columns are
     * hidden from its list table rather than shown empty.
     */
    sentCount: integer().notNull().default(0),
    deliveredCount: integer().notNull().default(0),
    seenCount: integer().notNull().default(0),
    clickedCount: integer().notNull().default(0),
    failedCount: integer().notNull().default(0),
    /**
     * Lifetime count of comments this automation was shown and declined to
     * answer — one per `CommentAutomationMiss` row, kept here for the same
     * reason as the delivery counters: the column is what the list table
     * renders, so it must not depend on aggregating a table over rows that may
     * one day be purged.
     *
     * Exact for the same reason too: the increment counts the rows an
     * `INSERT ... ON CONFLICT DO NOTHING RETURNING "automationId"` actually
     * returned, so a redelivered webhook or a BullMQ retry writes nothing and
     * moves nothing.
     *
     * Deliberately NOT comparable to `sentCount`: an attempt and a decline are
     * different events. The Misses column measures itself against
     * `repliesCount + missedCount` — the comments the automation actually
     * evaluated — because `sentCount` counts attempts on one half of the
     * comment only (see above), and one comment can be two of them.
     */
    missedCount: integer().notNull().default(0),
    post: jsonb()
      .$type<CommentPost>()
      .notNull()
      .default(sql`'{"type":"all","value":[]}'`),
    privateReply: jsonb()
      .$type<CommentReply>()
      .notNull()
      .default(sql`'{"type":"text","value":""}'`),
    publicReply: jsonb()
      .$type<CommentReply>()
      .notNull()
      .default(sql`'{"type":"none","value":null}'`),
    includeKeywords: jsonb()
      .$type<CommentIncludeKeywords>()
      .notNull()
      .default(sql`'{"type":"all","value":[]}'`),
    excludeKeywords: text().array().notNull().default(sql`ARRAY[]::text[]`),
    options: jsonb()
      .$type<CommentOptions>()
      .notNull()
      .default(
        sql`'{"replyToNewContactsOnly":false,"replyOncePerUserPerPost":false,"likeUserComment":false,"replyToUsersWhoCommentedOnOtherPosts":true,"ignoreCommentReplies":true,"trackUserTags":false}'`,
      ),
    hideComments: jsonb()
      .$type<CommentHideComments>()
      .notNull()
      .default(
        sql`'{"all":false,"hasPhoneNumber":false,"hasImage":false,"hasVideo":false,"hasLink":false,"hasKeywords":false,"keywords":[],"showCommentsAfter":"none"}'`,
      ),
    replyAfter: jsonb()
      .$type<CommentReplyAfter>()
      .notNull()
      .default(sql`'{"type":"immediately","value":0}'`),
  },
  (table) => [
    index("CommentAutomation_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("CommentAutomation_folderId_idx").using(
      "btree",
      table.folderId.asc().nullsLast(),
    ),
  ],
)
