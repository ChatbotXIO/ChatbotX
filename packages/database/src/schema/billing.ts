import {
  jsonb,
  type PgTimestampConfig,
  pgEnum,
  pgTable,
  timestamp,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"

export const billingStatus = pgEnum("BillingStatus", ["active", "expired"])

// `mode: "date"` is REQUIRED for the billing-period columns the MAC pipeline
// computes on. Without it Drizzle returns raw Postgres text (which
// `new Date(...)` cannot parse, producing an Invalid Date and crashing
// `billingMacKey`); with it, every read yields a real `Date`.
const periodTimestampConfig: PgTimestampConfig<"date"> = {
  mode: "date",
  precision: 6,
  withTimezone: true,
}

export const billingModel = pgTable("Billing", {
  ...sharedColumns,
  userId: bigintAsString()
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  // Start of the billing window. The MAC monthly period anchors on this date.
  periodStart: timestamp(periodTimestampConfig).notNull(),
  // Nullable: NULL means the billing window is open-ended.
  periodEnd: timestamp(periodTimestampConfig),
  status: billingStatus().notNull().default("active"),
  meta: jsonb().notNull().default({}),
})
