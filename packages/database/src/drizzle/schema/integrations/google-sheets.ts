import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { chatbotModel } from "../chatbot"
import { sharedColumns } from "../shared"
import { integrationModel } from "./base"

export const integrationGoogleSheetsModel = pgTable(
  "integration_google_sheets",
  {
    ...sharedColumns,
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    integrationId: bigint("integration_id", { mode: "bigint" })
      .notNull()
      .references(() => integrationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    auth: jsonb("auth").notNull(),
  },
  (table) => [
    uniqueIndex("integration_google_sheets_integration_id_key").using(
      "btree",
      table.integrationId.asc().nullsLast(),
    ),
  ],
)

export const spreadsheetModel = pgTable(
  "spreadsheets",
  {
    ...sharedColumns,
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    spreadsheetId: text("spreadsheet_id").notNull(),
  },
  (table) => [
    index("spreadsheets_chatbot_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
    index("spreadsheets_chatbot_id_spreadsheet_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
      table.spreadsheetId.asc().nullsLast(),
    ),
    index("spreadsheets_spreadsheet_id_idx").using(
      "btree",
      table.spreadsheetId.asc().nullsLast(),
    ),
  ],
)
