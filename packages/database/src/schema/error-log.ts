import { bigint, pgTable, text } from "drizzle-orm/pg-core"
import { sharedColumns } from "../partials/shared"
import { chatbotModel } from "./chatbot"
import { contactModel } from "./contact"

export const errorLogModel = pgTable("error_logs", {
  ...sharedColumns,
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  httpCode: text("http_code"),
  chatbotId: bigint("chatbot_id", { mode: "bigint" })
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  contactId: bigint("contact_id", { mode: "bigint" }).references(
    () => contactModel.id,
    {
      onDelete: "set null",
      onUpdate: "cascade",
    },
  ),
})
