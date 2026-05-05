"use server"

import { organizationService } from "@chatbotx.io/business"
import {
  type StripeSettingsSchema,
  stripeSettingsSchema,
} from "@chatbotx.io/database/partials"
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
      await organizationService.updateSettings({
        organization: ctx.organization,
        newSettings: {
          stripe: parsedInput,
        },
      })
    },
  )
