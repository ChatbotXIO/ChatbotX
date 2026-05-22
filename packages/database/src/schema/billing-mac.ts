import {
  integer,
  type PgTimestampConfig,
  pgTable,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { billingModel } from "./billing"

// `mode: "date"` is REQUIRED so reads via the query builder return a real
// `Date` rather than raw Postgres text — see the note in `billing.ts`.
const periodTimestampConfig: PgTimestampConfig<"date"> = {
  mode: "date",
  precision: 6,
  withTimezone: true,
}

export const billingMacModel = pgTable(
  "BillingMac",
  {
    ...sharedColumns,
    billingId: bigintAsString()
      .notNull()
      .references(() => billingModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    periodStart: timestamp(periodTimestampConfig).notNull(),
    periodEnd: timestamp(periodTimestampConfig).notNull(),
    macCount: integer().notNull().default(0),
  },
  (table) => [
    // One MAC rollup row per billing record per period window.
    unique("BillingMac_billingId_periodStart_periodEnd_unique").on(
      table.billingId,
      table.periodStart,
      table.periodEnd,
    ),
  ],
)
