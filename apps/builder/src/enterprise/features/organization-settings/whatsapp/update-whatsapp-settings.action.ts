"use server"

import {
  type WhatsappSettingsSchema,
  whatsappSettingsSchema,
} from "@chatbotx.io/database/partials"
import type { OrganizationModel } from "@chatbotx.io/database/types"
import { organizationService } from "@/features/organization/services"
import { organizationActionClient } from "@/lib/safe-action"

export const updateWhatsappSettingsAction = organizationActionClient
  .inputSchema(whatsappSettingsSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: WhatsappSettingsSchema
    }) => {
      await organizationService.updateSettings({
        organization: ctx.organization,
        newSettings: {
          whatsapp: parsedInput,
        },
      })
    },
  )
