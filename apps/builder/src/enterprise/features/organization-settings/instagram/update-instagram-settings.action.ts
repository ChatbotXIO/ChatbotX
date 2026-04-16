"use server"

import { db, eq } from "@chatbotx.io/database/client"
import {
  type InstagramSettingsSchema,
  instagramSettingsSchema,
} from "@chatbotx.io/database/partials"
import { organizationModel } from "@chatbotx.io/database/schema"
import type { OrganizationModel } from "@chatbotx.io/database/types"
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
      const organizationSettings = ctx.organization.settings
      organizationSettings.instagram = parsedInput

      await db
        .update(organizationModel)
        .set({
          settings: organizationSettings,
        })
        .where(eq(organizationModel.id, ctx.organization.id))
    },
  )
