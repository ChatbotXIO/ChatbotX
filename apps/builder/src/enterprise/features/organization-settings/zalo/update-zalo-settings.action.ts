"use server"

import { db, eq } from "@chatbotx.io/database/client"
import {
  type ZaloSettingsSchema,
  zaloSettingsSchema,
} from "@chatbotx.io/database/partials"
import { organizationModel } from "@chatbotx.io/database/schema"
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
