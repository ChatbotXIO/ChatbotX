"use server"

import {
  type InstagramSettingsSchema,
  instagramSettingsSchema,
} from "@chatbotx.io/database/partials"
import type { OrganizationModel } from "@chatbotx.io/database/types"
import { organizationService } from "@/features/organization/services"
import { organizationActionClient } from "@/lib/safe-action"

export const updateInstagramSettingAction = organizationActionClient
  .inputSchema(instagramSettingsSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: InstagramSettingsSchema
    }) => {
      await organizationService.updateSettings({
        organization: ctx.organization,
        newSettings: {
          instagram: parsedInput,
        },
      })
    },
  )
