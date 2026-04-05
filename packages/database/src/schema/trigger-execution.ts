import { index, pgTable, timestamp } from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { contactModel } from "./contact"
import { triggerModel } from "./trigger"
import { workspaceModel } from "./workspace"

export const triggerExecutionModel = pgTable(
  "TriggerExecution",
  {
    ...sharedColumns,
    executedAt: timestamp(timestampConfig).defaultNow().notNull(),
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
  },
  (table) => [
    index("TriggerExecution_triggerId_contactId_idx").using(
      "btree",
      table.triggerId.asc().nullsLast(),
      table.contactId.asc().nullsLast(),
    ),
    index("TriggerExecution_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
  ],
)
