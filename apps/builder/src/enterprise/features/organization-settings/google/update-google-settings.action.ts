"use server"

import { organizationService } from "@chatbotx.io/business"
import {
  type GoogleSettingsSchema,
  googleSettingsSchema,
} from "@chatbotx.io/database/partials"
import type { OrganizationModel } from "@chatbotx.io/database/types"

import { organizationActionClient } from "@/lib/safe-action"

export const updateGoogleSettingsAction = organizationActionClient
  .inputSchema(googleSettingsSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: GoogleSettingsSchema
    }) => {
      await organizationService.updateSettings({
        organization: ctx.organization,
        newSettings: {
          google: parsedInput,
        },
      })
    },
  )
