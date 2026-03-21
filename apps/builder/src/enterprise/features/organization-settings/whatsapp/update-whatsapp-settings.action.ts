"use server"

import { db, eq } from "@aha.chat/database/client"
import { organizationModel } from "@aha.chat/database/schema"
import {
  type OrganizationModel,
  type WhatsappSettingsSchema,
  whatsappSettingsSchema,
} from "@aha.chat/database/types"
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
