import {
  bigint,
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sharedColumns } from "../partials/shared"
import { chatbotModel } from "./chatbot"
import { contactModel } from "./contact"
import { folderModel } from "./folder"

export const tagModel = pgTable(
  "tags",
  {
    ...sharedColumns,
    name: text("name").notNull(),
    folderId: bigint("folder_id", { mode: "bigint" }).references(
      () => folderModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    syncToMessenger: boolean("sync_to_messenger").default(false).notNull(),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("tags_chatbot_id_name_key").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
    index("tags_folder_id_idx").using(
      "btree",
      table.folderId.asc().nullsLast(),
    ),
  ],
)

export const contactsToTagsModel = pgTable(
  "contacts_to_tags",
  {
    contactId: bigint("contact_id", { mode: "bigint" })
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    tagId: bigint("tag_id", { mode: "bigint" })
      .notNull()
      .references(() => tagModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({
      columns: [table.contactId, table.tagId],
    }),
  ],
)
