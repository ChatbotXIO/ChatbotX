"use server"

import { db } from "@aha.chat/database/client"
import { planModel } from "@aha.chat/database/schema"
import {
  type OrganizationModel,
  organizationSettingsSchema,
} from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import { invalidOrganizationSettingsError } from "@/features/organization/utils"
import { organizationActionClient } from "@/lib/safe-action"
import { getStripeClient } from "@/lib/stripe"
import { type CreatePlanRequest, createPlanRequest } from "../schemas/action"

export const createPlanAction = organizationActionClient
  .inputSchema(createPlanRequest)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: CreatePlanRequest
    }) => {
      return await createPlan(ctx.organization, parsedInput)
    },
  )

export const createPlan = async (
  organization: OrganizationModel,
  parsedInput: CreatePlanRequest,
) => {
  console.log("Creating plan with input:", parsedInput)
  const orgSettings = organizationSettingsSchema.parse(organization.settings)
  const stripeSettings = orgSettings.stripe
  if (!stripeSettings) {
    throw invalidOrganizationSettingsError("Stripe is not configured")
  }

  const stripe = getStripeClient(stripeSettings.secretKey)
  const { id: stripeProductId } = await stripe.products.create({
    name: parsedInput.name,
    description: parsedInput.description,
    marketing_features: parsedInput.marketingFeatures.map((v) => ({
      name: v.value,
    })),
  })
  const { id: priceId } = await stripe.prices.create({
    unit_amount: 1000,
    currency: parsedInput.currency,
    recurring: {
      interval: "month",
    },
    product: stripeProductId,
  })
  let annualDiscountPriceId: string | null = null
  if (parsedInput.annualPrice) {
    const { id } = await stripe.prices.create({
      unit_amount: parsedInput.annualPrice,
      currency: parsedInput.currency,
      recurring: {
        interval: "year",
      },
      product: stripeProductId,
    })
    annualDiscountPriceId = id
  }

  await db.insert(planModel).values({
    id: createId(),
    currency: parsedInput.currency,
    name: parsedInput.name,
    description: parsedInput.description,
    organizationId: organization.id,
    price: parsedInput.price,
    priceId,
    annualDiscountPrice: parsedInput.annualPrice,
    annualDiscountPriceId,
    limits: parsedInput.limits,
    marketingFeatures: parsedInput.marketingFeatures.map((v) => v.value),
    freeTrial: parsedInput.freeTrial,
  })
}
