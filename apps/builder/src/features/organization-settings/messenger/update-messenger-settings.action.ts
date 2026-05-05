"use server"

import { organizationService } from "@chatbotx.io/business"
import {
  type MessengerSettingsSchema,
  messengerSettingsSchema,
} from "@chatbotx.io/database/partials"
import type { OrganizationModel } from "@chatbotx.io/database/types"
import { organizationActionClient } from "@/lib/safe-action"

export const updateMessengerSettingAction = organizationActionClient
  .inputSchema(messengerSettingsSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: MessengerSettingsSchema
    }) => {
      const organizationSettings = ctx.organization.settings
      organizationSettings.messenger = parsedInput

      await organizationService.updateSettings({
        organization: ctx.organization,
        newSettings: {
          messenger: parsedInput,
        },
      })
    },
  )
