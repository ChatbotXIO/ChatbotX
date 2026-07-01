"use server"

import { tenantService } from "@chatbotx.io/business"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import {
  platformAdminActionClient,
  superAdminActionClient,
} from "@/lib/safe-action"
import {
  type UpdatePlatformBrandingSchema,
  updatePlatformBrandingSchema,
} from "./schema"

const toTenantBrandingData = (input: UpdatePlatformBrandingSchema) => {
  const { logoLight, logoDark, favicon, ...rest } = input
  return {
    ...rest,
    logoLightPath: logoLight.url || null,
    logoDarkPath: logoDark.url || null,
    faviconPath: favicon.url || null,
  }
}

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
      await tenantService.upsertByOwner(
        ctx.user.id,
        toTenantBrandingData(parsedInput),
      )
    },
  )

export const updateRootPlatformBrandingAction = superAdminActionClient
  .inputSchema(updatePlatformBrandingSchema)
  .action(
    async ({ parsedInput }: { parsedInput: UpdatePlatformBrandingSchema }) => {
      await tenantService.upsertById(
        ROOT_TENANT_ID,
        toTenantBrandingData(parsedInput),
      )
    },
  )
