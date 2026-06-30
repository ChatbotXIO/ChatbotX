import { index, integer, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../../partials/shared"
import { tenantModel } from "./tenant"

/**
 * A configurable HELP link managed by the tenant owner (reseller on cloud,
 * platform admin on self-hosted). Items are displayed in the app sidebar
 * footer HELP dropdown, ordered by `position`.
 */
export const tenantHelpItemModel = pgTable(
  "TenantHelpItem",
  {
    ...sharedColumns,
    tenantId: bigintAsString()
      .notNull()
      .references(() => tenantModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    url: text().notNull(),
    // Lucide icon name string (e.g. "BookOpen"). Nullable — omitted items show a generic icon.
    icon: text(),
    position: integer().notNull().default(0),
  },
  (table) => [
    index("TenantHelpItem_tenantId_position_idx").on(
      table.tenantId,
      table.position,
    ),
  ],
)
