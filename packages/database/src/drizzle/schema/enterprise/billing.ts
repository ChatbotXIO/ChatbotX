import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { organizationModel } from "../"
import { sharedColumns } from "../shared"

type PlanLimits = {
  contacts: number
}

type PlanFreeTrial = {
  days: number
}

export const subscriptionModel = pgTable("Subscription", {
  ...sharedColumns,
  plan: text().notNull(),
  referenceId: text().notNull(),
  stripeCustomerId: text(),
  stripeSubscriptionId: text(),
  status: text().notNull(),
  periodStart: timestamp({
    precision: 6,
    withTimezone: true,
  }),
  periodEnd: timestamp({ precision: 6, withTimezone: true }),
  cancelAtPeriodEnd: boolean(),
  cancelAt: timestamp({ precision: 6, withTimezone: true }),
  canceledAt: timestamp({ precision: 6, withTimezone: true }),
  endedAt: timestamp({ precision: 6, withTimezone: true }),
  seats: integer(),
  trialStart: timestamp({ precision: 6, withTimezone: true }),
  trialEnd: timestamp({ precision: 6, withTimezone: true }),
  billingInterval: text(),
  stripeScheduleId: text(),
})

export const planModel = pgTable("Plan", {
  ...sharedColumns,
  name: text().notNull(),
  description: text(),
  price: integer().notNull(),
  priceId: text().notNull(),
  annualDiscountPrice: integer(),
  annualDiscountPriceId: text(),
  limits: jsonb().$type<PlanLimits>().notNull(),
  freeTrial: jsonb().$type<PlanFreeTrial>(),
  currency: text().notNull(),
  marketingFeatures: text().array().notNull().default([]),
  organizationId: text()
    .notNull()
    .references(() => organizationModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "BillingPlan_organizationId_fkey",
    }),
})
