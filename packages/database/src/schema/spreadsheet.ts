import { index, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const spreadsheetModel = pgTable(
  "Spreadsheet",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    url: text().notNull(),
    spreadsheetId: text().notNull(),
  },
  (table) => [
    index("Spreadsheet_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("Spreadsheet_workspaceId_spreadsheetId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.spreadsheetId.asc().nullsLast(),
    ),
    index("Spreadsheet_spreadsheetId_idx").using(
      "btree",
      table.spreadsheetId.asc().nullsLast(),
    ),
  ],
)
