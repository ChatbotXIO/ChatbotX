import { index, pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { contactModel } from "./contact"
import { triggerModel } from "./trigger"
import { workspaceModel } from "./workspace"

export const triggerContactHistoryModel = pgTable(
  "TriggerContactHistory",
  {
    ...sharedColumns,
    triggerId: bigintAsString()
      .notNull()
      .references(() => triggerModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    firstEnteredAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.contactId],
      name: "TriggerContactHistory_pkey",
    }),
    index("TriggerContactHistory_triggerId_contactId_idx").using(
      "btree",
      table.triggerId.asc().nullsLast(),
      table.contactId.asc().nullsLast(),
    ),
    index("TriggerContactHistory_contactId_idx").using(
      "btree",
      table.contactId.asc().nullsLast(),
    ),
    index("TriggerContactHistory_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
  ],
)
