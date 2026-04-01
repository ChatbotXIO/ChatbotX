"use server"

import { db, eq } from "@chatbotx.io/database/client"
import {
  type StripeSettingsSchema,
  stripeSettingsSchema,
} from "@chatbotx.io/database/partials"
import { organizationModel } from "@chatbotx.io/database/schema"
import type { OrganizationModel } from "@chatbotx.io/database/types"
import { organizationActionClient } from "@/lib/safe-action"

export const updateStripeSettingsAction = organizationActionClient
  .inputSchema(stripeSettingsSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: StripeSettingsSchema
    }) => {
      const organizationSettings = ctx.organization.settings
      organizationSettings.stripe = parsedInput

      await db
        .update(organizationModel)
        .set({
          settings: organizationSettings,
        })
        .where(eq(organizationModel.id, ctx.organization.id))
    },
  )
