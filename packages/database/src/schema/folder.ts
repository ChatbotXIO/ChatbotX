import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
} from "drizzle-orm/pg-core"
import { sharedColumns } from "../partials/shared"
import { chatbotModel } from "./chatbot"

export const folderType = pgEnum("folder_type", [
  "tag",
  "flow",
  "customField",
  "automatedResponse",
  "trigger",
  "webhook",
  "sequence",
])

export const folderModel = pgTable(
  "folders",
  {
    ...sharedColumns,
    name: text("name").notNull(),
    folderType: folderType("folder_type").notNull(),
    parentId: bigint("parent_id", { mode: "bigint" }),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    isTrash: boolean("is_trash").default(false).notNull(),
    paths: bigint("paths", { mode: "bigint" })
      .array()
      .notNull()
      .default(sql`[]`),
  },
  (table) => [
    index("folders_chatbot_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
    index("folders_parent_id_idx").using(
      "btree",
      table.parentId.asc().nullsLast(),
    ),
  ],
)
