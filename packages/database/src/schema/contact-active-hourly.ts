import { pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../partials/shared"

export const contactActiveHourlyModel = pgTable(
  "ContactActiveHourly",
  {
    workspaceId: bigintAsString().notNull(),
    contactId: bigintAsString().notNull(),
    contactInboxId: bigintAsString().notNull(),
    hourBucket: timestamp(timestampConfig).notNull(),
    inboxId: bigintAsString().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.hourBucket, table.contactInboxId],
    }),
  ],
)
