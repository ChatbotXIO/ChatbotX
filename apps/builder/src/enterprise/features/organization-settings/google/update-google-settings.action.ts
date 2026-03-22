"use server"

import { db, eq } from "@aha.chat/database/client"
import { organizationModel } from "@aha.chat/database/schema"
import {
  type GoogleSettingsSchema,
  googleSettingsSchema,
  type OrganizationModel,
} from "@aha.chat/database/types"
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
      const organizationSettings = ctx.organization.settings
      organizationSettings.google = parsedInput

      await db
        .update(organizationModel)
        .set({
          settings: organizationSettings,
        })
        .where(eq(organizationModel.id, ctx.organization.id))
    },
  )
