import { bigint, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { sharedColumns } from "../partials/shared"
import { userModel } from "./auth"
import { chatbotModel } from "./chatbot"

export const inboxModel = pgTable(
  "inboxes",
  {
    ...sharedColumns,
    name: text("name").notNull().default(""),
    channel: text("channel").notNull(),
    sourceId: text("source_id").notNull(),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    status: text("status").default("connected").notNull(),
  },
  (table) => [
    index("inboxes_chatbot_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
    uniqueIndex("inboxes_chatbot_id_channel_source_id_key").using(
      "btree",
      table.channel.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
  ],
)

export const inboxTeamModel = pgTable("inbox_teams", {
  ...sharedColumns,
  chatbotId: bigint("chatbot_id", { mode: "bigint" })
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  name: text("name").notNull(),
})

export const inboxTeamMemberModel = pgTable("inbox_team_members", {
  ...sharedColumns,
  inboxTeamId: bigint("inbox_team_id", { mode: "bigint" })
    .notNull()
    .references(() => inboxTeamModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  userId: bigint("user_id", { mode: "bigint" })
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
})
