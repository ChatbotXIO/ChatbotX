import { sql } from "drizzle-orm"
import { index, pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../partials/shared"

// 1:1 "last known state" per contact, extensible with new nullable columns.
// Partitioned by HASH(workspaceId) in its migration, with no FKs (see
// ContactActivity). The leaves carry fillfactor 80 because rows are updated.
export const contactStateModel = pgTable(
  "ContactState",
  {
    workspaceId: bigintAsString().notNull(),
    contactId: bigintAsString().notNull(),
    lastDeliveredAt: timestamp(timestampConfig),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.contactId],
      name: "ContactState_pkey",
    }),
    index("ContactState_lastDeliveredAt_idx")
      .on(table.workspaceId, table.lastDeliveredAt)
      .where(sql`${table.lastDeliveredAt} IS NOT NULL`),
  ],
)
