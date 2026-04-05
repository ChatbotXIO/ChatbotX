import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { sharedColumns, timestampConfig } from "../../partials/shared"

export const subscriptionModel = pgTable("Subscription", {
  ...sharedColumns,
  plan: text().notNull(),
  referenceId: text().notNull(),
  stripeCustomerId: text(),
  stripeSubscriptionId: text(),
  status: text().notNull(),
  periodStart: timestamp(timestampConfig),
  periodEnd: timestamp(timestampConfig),
  cancelAtPeriodEnd: boolean(),
  cancelAt: timestamp(timestampConfig),
  canceledAt: timestamp(timestampConfig),
  endedAt: timestamp(timestampConfig),
  seats: integer(),
  trialStart: timestamp(timestampConfig),
  trialEnd: timestamp(timestampConfig),
  billingInterval: text(),
  stripeScheduleId: text(),
})
