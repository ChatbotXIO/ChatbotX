import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../../partials/shared"
import { organizationModel } from "../organization"

type PlanLimits = {
  contacts: number
}

type PlanFreeTrial = {
  days: number
}

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
  organizationId: bigintAsString()
    .notNull()
    .references(() => organizationModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "Plan_organizationId_fkey",
    }),
})
