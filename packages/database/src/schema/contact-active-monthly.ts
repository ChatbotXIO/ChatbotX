import { pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../partials/shared"

export const contactActiveMonthlyModel = pgTable(
  "ContactActiveMonthly",
  {
    workspaceId: bigintAsString().notNull(),
    contactId: bigintAsString().notNull(),
    contactInboxId: bigintAsString().notNull(),
    periodStart: timestamp(timestampConfig).notNull(),
    inboxId: bigintAsString().notNull(),
    workspaceMacId: bigintAsString().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.periodStart, table.contactInboxId],
    }),
  ],
)
