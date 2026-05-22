import { integer, pgTable, unique } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { billingMacModel } from "./billing-mac"
import { workspaceModel } from "./workspace"

export const workspaceMacModel = pgTable(
  "WorkspaceMac",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // The billing-month this workspace rollup belongs to. Period bounds are
    // reached via billingMacId -> BillingMac, not stored here.
    billingMacId: bigintAsString()
      .notNull()
      .references(() => billingMacModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    macCount: integer().notNull().default(0),
  },
  (table) => [
    // One MAC rollup row per workspace per billing-month.
    unique("WorkspaceMac_workspaceId_billingMacId_unique").on(
      table.workspaceId,
      table.billingMacId,
    ),
  ],
)
