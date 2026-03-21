"use server"

import { db, eq } from "@aha.chat/database/client"
import { organizationModel } from "@aha.chat/database/schema"
import {
  type OrganizationModel,
  type StripeSettingsSchema,
  stripeSettingsSchema,
} from "@aha.chat/database/types"
import { organizationActionClient } from "@/lib/safe-action"

export const updateStripeSettingsAction = organizationActionClient
  .inputSchema(stripeSettingsSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: StripeSettingsSchema
    }) => {
      const organizationSettings = ctx.organization.settings
      organizationSettings.stripe = parsedInput

      await db
        .update(organizationModel)
        .set({
          settings: organizationSettings,
        })
        .where(eq(organizationModel.id, ctx.organization.id))
    },
  )
