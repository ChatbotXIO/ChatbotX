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
  type FBCommentHideComments,
  type FBCommentIncludeKeywords,
  type FBCommentOptions,
  type FBCommentPost,
  type FBCommentReply,
  type FBCommentReplyAfter,
  fbCommentAutomationTypes,
} from "../partials/fb-comment-automation"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { folderModel } from "./folder"
import { workspaceModel } from "./workspace"

export const fbCommentAutomationType = pgEnum(
  "fbCommentAutomationType",
  fbCommentAutomationTypes.options as [string, ...string[]],
)

export const fbCommentAutomationModel = pgTable(
  "FBCommentAutomation",
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
    type: fbCommentAutomationType().notNull().default("messenger"),
    isActive: boolean().notNull().default(true),
    startTime: text(),
    endTime: text(),
    repliesCount: integer().notNull().default(0),
    post: jsonb()
      .$type<FBCommentPost>()
      .notNull()
      .default(sql`'{"type":"all","value":[]}'`),
    privateReply: jsonb()
      .$type<FBCommentReply>()
      .notNull()
      .default(sql`'{"type":"text","value":""}'`),
    publicReply: jsonb()
      .$type<FBCommentReply>()
      .notNull()
      .default(sql`'{"type":"none","value":null}'`),
    includeKeywords: jsonb()
      .$type<FBCommentIncludeKeywords>()
      .notNull()
      .default(sql`'{"type":"all","value":[]}'`),
    excludeKeywords: text().array().notNull().default(sql`ARRAY[]::text[]`),
    options: jsonb()
      .$type<FBCommentOptions>()
      .notNull()
      .default(
        sql`'{"replyToNewContactsOnly":false,"replyOncePerUserPerPost":false,"likeUserComment":false,"replyToUsersWhoCommentedOnOtherPosts":true,"ignoreCommentReplies":true,"trackUserTags":false}'`,
      ),
    hideComments: jsonb()
      .$type<FBCommentHideComments>()
      .notNull()
      .default(
        sql`'{"all":false,"hasPhoneNumber":false,"hasImage":false,"hasVideo":false,"hasLink":false,"hasKeywords":false,"keywords":[],"showCommentsAfter":"none"}'`,
      ),
    replyAfter: jsonb()
      .$type<FBCommentReplyAfter>()
      .notNull()
      .default(sql`'{"type":"immediately","value":0}'`),
  },
  (table) => [
    index("FBCommentAutomation_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("FBCommentAutomation_folderId_idx").using(
      "btree",
      table.folderId.asc().nullsLast(),
    ),
  ],
)
