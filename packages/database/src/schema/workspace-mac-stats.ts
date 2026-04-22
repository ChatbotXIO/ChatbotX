import {
  date,
  integer,
  pgTable,
  primaryKey,
  timestamp,
} from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const workspaceMacMonthlyModel = pgTable(
  "WorkspaceMacMonthly",
  {
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    periodStart: date({ mode: "string" }).notNull(),
    periodEnd: date({ mode: "string" }).notNull(),
    macCount: integer().notNull().default(0),
    billingId: bigintAsString().notNull(),
    updatedAt: timestamp(timestampConfig).defaultNow().notNull(),
    lockedAt: timestamp(timestampConfig),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.periodStart, table.billingId],
    }),
  ],
)
