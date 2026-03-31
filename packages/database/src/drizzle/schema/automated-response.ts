import { sql } from "drizzle-orm"
import { bigint, boolean, index, pgTable, text } from "drizzle-orm/pg-core"
import { z } from "zod"
import { chatbotModel } from "./chatbot"
import { flowModel } from "./flow"
import { folderModel } from "./folder"
import { sharedColumns } from "./shared"

export const replyTypes = z.enum(["text", "flow"])
export type ReplyType = z.infer<typeof replyTypes>

export const replyMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(replyTypes.enum.text),
    text: z.string(),
  }),
  z.object({
    type: z.literal(replyTypes.enum.flow),
    flowId: z.bigint(),
  }),
])

export const automatedResponseModel = pgTable(
  "automated_responses",
  {
    ...sharedColumns,
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    folderId: bigint("folder_id", { mode: "bigint" }).references(
      () => folderModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    userMessages: text("user_messages").array().notNull().default(sql`[]`),
    status: boolean("status").notNull(),
    text: text("text"),
    flowId: bigint("flow_id", { mode: "bigint" }).references(
      () => flowModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
  },
  (table) => [
    index("automated_responses_chatbot_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
  ],
)
