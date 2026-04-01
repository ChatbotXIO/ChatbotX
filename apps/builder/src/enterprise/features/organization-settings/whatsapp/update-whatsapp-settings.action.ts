"use server"

import { db, eq } from "@chatbotx.io/database/client"
import {
  type WhatsappSettingsSchema,
  whatsappSettingsSchema,
} from "@chatbotx.io/database/partials"
import { organizationModel } from "@chatbotx.io/database/schema"
import type { OrganizationModel } from "@chatbotx.io/database/types"
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
      const organizationSettings = ctx.organization.settings
      organizationSettings.whatsapp = parsedInput

      await db
        .update(organizationModel)
        .set({
          settings: organizationSettings,
        })
        .where(eq(organizationModel.id, ctx.organization.id))
    },
  )
