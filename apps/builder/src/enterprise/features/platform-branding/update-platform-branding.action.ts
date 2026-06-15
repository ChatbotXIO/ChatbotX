"use server"

import { tenantService } from "@chatbotx.io/business"
import type { UserModel } from "@chatbotx.io/database/types"
import { platformAdminActionClient } from "@/lib/safe-action"
import {
  type UpdatePlatformBrandingSchema,
  updatePlatformBrandingSchema,
} from "./schema"

export const updatePlatformBrandingAction = platformAdminActionClient
  .inputSchema(updatePlatformBrandingSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: UpdatePlatformBrandingSchema
    }) => {
      const { logoLight, logoDark, favicon, ...rest } = parsedInput

      await tenantService.upsertByOwner(ctx.user.id, {
        ...rest,
        logoLightPath: logoLight.url || null,
        logoDarkPath: logoDark.url || null,
        faviconPath: favicon.url || null,
      })
    },
  )
