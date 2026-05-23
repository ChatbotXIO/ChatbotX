"use server"

import { platformSettingService } from "@chatbotx.io/business"
import type { UserModel } from "@chatbotx.io/database/types"
import { env, isCloud } from "@/env"
import { authActionClient } from "@/lib/safe-action"
import {
  type UpdatePlatformBrandingSchema,
  updatePlatformBrandingSchema,
} from "./schema"

const isPlatformAdmin = async (user: UserModel): Promise<boolean> => {
  if (isCloud()) {
    const setting = await platformSettingService.findForUser(user.id)
    return Boolean(setting?.isEnabled)
  }
  return Boolean(
    env.PLATFORM_ADMIN_EMAIL && user.email === env.PLATFORM_ADMIN_EMAIL,
  )
}

export const updatePlatformBrandingAction = authActionClient
  .inputSchema(updatePlatformBrandingSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: UpdatePlatformBrandingSchema
    }) => {
      if (!(await isPlatformAdmin(ctx.user))) {
        throw new Error("Unauthorized")
      }

      const { logoLight, logoDark, favicon, ...rest } = parsedInput

      await platformSettingService.upsert(ctx.user.id, {
        ...rest,
        logoLightPath: logoLight.url || null,
        logoDarkPath: logoDark.url || null,
        faviconPath: favicon.url || null,
      })
    },
  )
