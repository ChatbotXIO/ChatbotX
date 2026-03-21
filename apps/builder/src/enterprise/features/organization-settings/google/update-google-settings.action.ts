"use server"

import { db, eq } from "@chatbotx.io/database/client"
import { organizationModel } from "@chatbotx.io/database/schema"
import {
  type GoogleSettingsSchema,
  googleSettingsSchema,
  type OrganizationModel,
} from "@chatbotx.io/database/types"
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
