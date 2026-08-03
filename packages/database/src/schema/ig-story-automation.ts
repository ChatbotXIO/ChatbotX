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
  FBCommentIncludeKeywords,
  FBCommentReply,
} from "../partials/fb-comment-automation"
import {
  type IgStoryTarget,
  igStoryAutomationTypes,
} from "../partials/ig-story-automation"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { folderModel } from "./folder"
import { workspaceModel } from "./workspace"

export const igStoryAutomationType = pgEnum(
  "igStoryAutomationType",
  igStoryAutomationTypes.options as [string, ...string[]],
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
    isActive: boolean().notNull().default(true),
    startTime: text(),
    endTime: text(),
    repliesCount: integer().notNull().default(0),
    story: jsonb()
      .$type<IgStoryTarget>()
      .notNull()
      .default(sql`'{"type":"all","value":[]}'`),
    reply: jsonb()
      .$type<FBCommentReply>()
      .notNull()
      .default(sql`'{"type":"none","value":null}'`),
    includeKeywords: jsonb()
      .$type<FBCommentIncludeKeywords>()
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
  ],
)
