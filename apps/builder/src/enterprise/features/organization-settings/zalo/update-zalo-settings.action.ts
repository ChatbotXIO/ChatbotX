"use server"

import { db, eq } from "@aha.chat/database/client"
import { organizationModel } from "@aha.chat/database/schema"
import {
  type OrganizationModel,
  type ZaloSettingsSchema,
  zaloSettingsSchema,
} from "@aha.chat/database/types"
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
      const organizationSettings = ctx.organization.settings
      organizationSettings.zalo = parsedInput

      await db
        .update(organizationModel)
        .set({
          settings: organizationSettings,
        })
        .where(eq(organizationModel.id, ctx.organization.id))
    },
  )
