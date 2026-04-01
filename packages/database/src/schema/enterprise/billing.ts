import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { sharedColumns } from "../../partials/shared"
import { organizationModel } from ".."

type PlanLimits = {
  contacts: number
}

type PlanFreeTrial = {
  days: number
}

export const subscriptionModel = pgTable("subscriptions", {
  ...sharedColumns,
  plan: text("plan").notNull(),
  referenceId: text("reference_id").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").notNull(),
  periodStart: timestamp("period_start", {
    precision: 6,
    withTimezone: true,
  }),
  periodEnd: timestamp("period_end", { precision: 6, withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end"),
  cancelAt: timestamp("cancel_at", { precision: 6, withTimezone: true }),
  canceledAt: timestamp("canceled_at", { precision: 6, withTimezone: true }),
  endedAt: timestamp("ended_at", { precision: 6, withTimezone: true }),
  seats: integer("seats"),
  trialStart: timestamp("trial_start", { precision: 6, withTimezone: true }),
  trialEnd: timestamp("trial_end", { precision: 6, withTimezone: true }),
  billingInterval: text("billing_interval"),
  stripeScheduleId: text("stripe_schedule_id"),
})

export const planModel = pgTable("plans", {
  ...sharedColumns,
  name: text("name").notNull(),
  description: text("description"),
  price: integer("price").notNull(),
  priceId: text("price_id").notNull(),
  annualDiscountPrice: integer("annual_discount_price"),
  annualDiscountPriceId: text("annual_discount_price_id"),
  limits: jsonb().$type<PlanLimits>().notNull(),
  freeTrial: jsonb("free_trial").$type<PlanFreeTrial>(),
  currency: text("currency").notNull(),
  marketingFeatures: text("marketing_features").array().notNull().default([]),
  organizationId: bigint("organization_id", { mode: "bigint" })
    .notNull()
    .references(() => organizationModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "billing_plans_organization_id_fkey",
    }),
})
