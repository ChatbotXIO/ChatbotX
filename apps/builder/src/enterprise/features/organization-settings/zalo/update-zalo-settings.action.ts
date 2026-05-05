"use server"

import { organizationService } from "@chatbotx.io/business"
import {
  type ZaloSettingsSchema,
  zaloSettingsSchema,
} from "@chatbotx.io/database/partials"
import type { OrganizationModel } from "@chatbotx.io/database/types"

import { organizationActionClient } from "@/lib/safe-action"

export const updateZaloSettingsAction = organizationActionClient
  .inputSchema(zaloSettingsSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: ZaloSettingsSchema
    }) => {
      await organizationService.updateSettings({
        organization: ctx.organization,
        newSettings: {
          zalo: parsedInput,
        },
      })
    },
  )
