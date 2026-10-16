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
import type {
  CommentIncludeKeywords,
  CommentReply,
} from "../partials/comment-automation"
import {
  type IgStoryAutomationTrigger,
  type IgStoryTarget,
  igStoryAutomationTriggers,
  igStoryAutomationTypes,
} from "../partials/ig-story-automation"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { folderModel } from "./folder"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const igStoryAutomationType = pgEnum(
  "igStoryAutomationType",
  igStoryAutomationTypes.options as [string, ...string[]],
)

export const igStoryAutomationTrigger = pgEnum(
  "igStoryAutomationTrigger",
  igStoryAutomationTriggers.options as [string, ...string[]],
)

export const igStoryAutomationModel = pgTable(
  "IgStoryAutomation",
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
    type: igStoryAutomationType().notNull(),
    trigger: igStoryAutomationTrigger()
      .$type<IgStoryAutomationTrigger>()
      .notNull()
      .default("storyReply"),
    /**
     * The Instagram account this automation answers story replies on; `NULL`
     * means every account of `type` in the workspace. Same rules as
     * `CommentAutomation.inboxId`, including `cascade` over `set null`.
     */
    inboxId: bigintAsString().references(() => inboxModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    isActive: boolean().notNull().default(true),
    startTime: text(),
    endTime: text(),
    repliesCount: integer().notNull().default(0),
    story: jsonb()
      .$type<IgStoryTarget>()
      .notNull()
      .default(sql`'{"type":"all","value":[]}'`),
    reply: jsonb()
      .$type<CommentReply>()
      .notNull()
      .default(sql`'{"type":"none","value":null}'`),
    includeKeywords: jsonb()
      .$type<CommentIncludeKeywords>()
      .notNull()
      .default(sql`'{"type":"all","value":[]}'`),
  },
  (table) => [
    index("IgStoryAutomation_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("IgStoryAutomation_folderId_idx").using(
      "btree",
      table.folderId.asc().nullsLast(),
    ),
    index("IgStoryAutomation_inboxId_idx").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
  ],
)
