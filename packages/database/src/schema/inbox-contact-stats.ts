import { integer, pgTable } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { inboxModel } from "./inbox"

export const inboxContactStatsModel = pgTable("InboxContactStat", {
  inboxId: bigintAsString()
    .primaryKey()
    .references(() => inboxModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  totalContacts: integer().notNull().default(0),
  updatedAt: sharedColumns.updatedAt,
})
