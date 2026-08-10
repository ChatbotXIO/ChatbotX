"use server"

import { tenantService } from "@chatbotx.io/business"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import {
  platformAdminActionClient,
  superAdminActionClient,
} from "@/lib/safe-action"
import {
  type UpdatePlatformChannelsSchema,
  updatePlatformChannelsSchema,
} from "./schema"

/**
 * Reseller-scoped: hides channels for the caller's own tenant only. Never
 * accepts a `tenantId` from input — always derived from `ctx.user.id` — so a
 * reseller can never target another tenant's row. Mirrors the platform vs.
 * reseller pairing in `update-platform-branding.action.ts`.
 */
export const updatePlatformChannelsAction = platformAdminActionClient
  .inputSchema(updatePlatformChannelsSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: UpdatePlatformChannelsSchema
    }) => {
      await tenantService.upsertByOwner(ctx.user.id, parsedInput)
    },
  )

/** Platform-scoped: hides channels for every tenant (the operator's ceiling). */
export const updateRootPlatformChannelsAction = superAdminActionClient
  .inputSchema(updatePlatformChannelsSchema)
  .action(
    async ({ parsedInput }: { parsedInput: UpdatePlatformChannelsSchema }) => {
      await tenantService.upsertById(ROOT_TENANT_ID, parsedInput)
    },
  )
