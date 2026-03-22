"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { planModel } from "@aha.chat/database/schema"
import type { PlanModel } from "@aha.chat/database/types"
import {
  type OrganizationModel,
  organizationSettingsSchema,
} from "@aha.chat/database/types"
import { invalidOrganizationSettingsError } from "@/features/organization/utils"
import { organizationActionClient } from "@/lib/safe-action"
import { getStripeClient } from "@/lib/stripe"
import { type UpdatePlanRequest, updatePlanRequest } from "../schemas/action"

export const updatePlanAction = organizationActionClient
  .inputSchema(updatePlanRequest)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: UpdatePlanRequest
    }) => {
      return await updatePlan(ctx.organization, parsedInput)
    },
  )

export const updatePlan = async (
  organization: OrganizationModel,
  parsedInput: UpdatePlanRequest,
) => {
  const plan = await findOrFail<PlanModel>(planModel, {
    id: parsedInput.id,
    organizationId: organization.id,
  })

  const orgSettings = organizationSettingsSchema.parse(organization.settings)
  const stripeSettings = orgSettings.stripe
  if (!stripeSettings) {
    throw invalidOrganizationSettingsError("Stripe is not configured")
  }

  const stripe = getStripeClient(stripeSettings.secretKey)
  const updatePayload: Partial<{
    name: string
    description: string | null
    price: number
    priceId: string
    annualDiscountPrice: number | null
    annualDiscountPriceId: string | null
    currency: string
    limits: { contacts: number }
    freeTrial: { days: number } | null
    marketingFeatures: string[]
  }> = {}

  const hasProductUpdate =
    parsedInput.name !== undefined ||
    parsedInput.description !== undefined ||
    parsedInput.marketingFeatures !== undefined
  const needsStripeProductId =
    hasProductUpdate ||
    parsedInput.price !== undefined ||
    parsedInput.annualPrice !== undefined

  let stripeProductId: string | null = null
  if (needsStripeProductId) {
    const price = await stripe.prices.retrieve(plan.priceId)
    stripeProductId =
      typeof price.product === "string" ? price.product : price.product.id
  }

  if (hasProductUpdate && stripeProductId) {
    const name = parsedInput.name === undefined ? plan.name : parsedInput.name
    const description =
      parsedInput.description === undefined
        ? plan.description
        : parsedInput.description
    const marketingFeatures =
      parsedInput.marketingFeatures === undefined
        ? (plan.marketingFeatures ?? [])
        : parsedInput.marketingFeatures.map((v) => v.value)
    await stripe.products.update(stripeProductId, {
      name,
      description: description ?? undefined,
      marketing_features: marketingFeatures.map((f) => ({ name: f })),
    })
  }

  if (parsedInput.price !== undefined && stripeProductId) {
    const { id: newPriceId } = await stripe.prices.create({
      unit_amount: parsedInput.price,
      currency: parsedInput.currency ?? plan.currency,
      recurring: { interval: "month" },
      product: stripeProductId,
    })
    updatePayload.price = parsedInput.price
    updatePayload.priceId = newPriceId
  }

  if (parsedInput.annualPrice !== undefined && stripeProductId) {
    const currency = parsedInput.currency ?? plan.currency
    const { id: newAnnualPriceId } = await stripe.prices.create({
      unit_amount: parsedInput.annualPrice,
      currency,
      recurring: { interval: "year" },
      product: stripeProductId,
    })
    updatePayload.annualDiscountPrice = parsedInput.annualPrice
    updatePayload.annualDiscountPriceId = newAnnualPriceId
  }

  if (parsedInput.name !== undefined) {
    updatePayload.name = parsedInput.name
  }
  if (parsedInput.description !== undefined) {
    updatePayload.description = parsedInput.description
  }
  if (parsedInput.currency !== undefined) {
    updatePayload.currency = parsedInput.currency
  }
  if (parsedInput.limits !== undefined) {
    updatePayload.limits = parsedInput.limits
  }
  if (parsedInput.freeTrial !== undefined) {
    updatePayload.freeTrial = parsedInput.freeTrial
  }
  if (parsedInput.marketingFeatures !== undefined) {
    updatePayload.marketingFeatures = parsedInput.marketingFeatures.map(
      (v) => v.value,
    )
  }

  if (Object.keys(updatePayload).length > 0) {
    await db
      .update(planModel)
      .set(updatePayload)
      .where(eq(planModel.id, plan.id))
  }
}
