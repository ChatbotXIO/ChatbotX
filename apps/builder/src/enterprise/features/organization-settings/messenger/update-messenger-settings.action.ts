"use server"

import { db, eq } from "@chatbotx.io/database/client"
import {
  type MessengerSettingsSchema,
  messengerSettingsSchema,
} from "@chatbotx.io/database/partials"
import { organizationModel } from "@chatbotx.io/database/schema"
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

      await db
        .update(organizationModel)
        .set({
          settings: organizationSettings,
        })
        .where(eq(organizationModel.id, ctx.organization.id))
    },
  )
