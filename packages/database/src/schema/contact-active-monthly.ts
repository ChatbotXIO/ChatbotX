import { date, pgTable, primaryKey } from "drizzle-orm/pg-core"
import { bigintAsString } from "../partials/shared"

export const contactActiveMonthlyModel = pgTable(
  "ContactActiveMonthly",
  {
    workspaceId: bigintAsString().notNull(),
    contactId: bigintAsString().notNull(),
    contactInboxId: bigintAsString().notNull(),
    periodStart: date({ mode: "string" }).notNull(),
    periodEnd: date({ mode: "string" }).notNull(),
    inboxId: bigintAsString().notNull(),
    billingId: bigintAsString().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.workspaceId,
        table.periodStart,
        table.contactInboxId,
        table.billingId,
      ],
    }),
  ],
)
