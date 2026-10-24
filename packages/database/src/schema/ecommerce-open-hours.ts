import { index, jsonb, pgTable, text } from "drizzle-orm/pg-core"
import type { OpenHoursRange } from "../partials/ecommerce"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

/**
 * A named open-hours schedule ("Weekdays 9–17"). The store settings and each
 * vendor pick one; none picked means always open. `ranges` has no database
 * default: every insert writes it.
 */
export const ecommerceOpenHoursModel = pgTable(
  "EcommerceOpenHours",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    ranges: jsonb().$type<OpenHoursRange[]>().notNull(),
  },
  (table) => [
    index("EcommerceOpenHours_workspaceId_idx").on(table.workspaceId),
  ],
)
