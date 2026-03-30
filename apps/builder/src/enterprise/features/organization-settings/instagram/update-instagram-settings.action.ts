"use server"

import { db, eq } from "@aha.chat/database/client"
import { organizationModel } from "@aha.chat/database/schema"
import {
  type InstagramSettingsSchema,
  instagramSettingsSchema,
  type OrganizationModel,
} from "@aha.chat/database/types"
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
