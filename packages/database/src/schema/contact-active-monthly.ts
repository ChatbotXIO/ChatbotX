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
    // References Billing.id. No FK constraint: this is a partitioned table.
    billingId: bigintAsString().notNull(),
    // References WorkspaceMac.id. No FK constraint (partitioned table). NOT in
    // the PK — one row per (workspaceId, periodStart, contactInboxId); keying
    // on workspaceMacId would let one contact insert twice and double-count.
    workspaceMacId: bigintAsString().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.periodStart, table.contactInboxId],
    }),
  ],
)
