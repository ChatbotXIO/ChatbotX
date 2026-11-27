"use server"

import { tenantDefaultTemplateService } from "@chatbotx.io/business"
import type { UserModel } from "@chatbotx.io/database/types"
import {
  platformAdminActionClient,
  superAdminActionClient,
} from "@/lib/safe-action"
import { saveDefaultTemplate } from "./save-outcome"
import {
  type UpdateDefaultTemplateSchema,
  updateDefaultTemplateSchema,
} from "./schema"

/**
 * Reseller-scoped: the tenant is always derived from `ctx.user.id`, never from
 * input, so a reseller can only ever set the default of their own tenant.
 */
export const updateDefaultTemplateAction = platformAdminActionClient
  .inputSchema(updateDefaultTemplateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: UpdateDefaultTemplateSchema
    }) =>
      await saveDefaultTemplate(
        { kind: "owner", ownerId: ctx.user.id },
        parsedInput,
        ctx.user.id,
      ),
  )

export const clearDefaultTemplateAction = platformAdminActionClient.action(
  async ({ ctx }: { ctx: { user: UserModel } }) => {
    await tenantDefaultTemplateService.clear({
      scope: { kind: "owner", ownerId: ctx.user.id },
      actorUserId: ctx.user.id,
    })
  },
)

/** Platform-scoped: the root tenant's default, for self-hosted and the platform itself. */
export const updateRootDefaultTemplateAction = superAdminActionClient
  .inputSchema(updateDefaultTemplateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: UpdateDefaultTemplateSchema
    }) => await saveDefaultTemplate({ kind: "root" }, parsedInput, ctx.user.id),
  )

export const clearRootDefaultTemplateAction = superAdminActionClient.action(
  async ({ ctx }: { ctx: { user: UserModel } }) => {
    await tenantDefaultTemplateService.clear({
      scope: { kind: "root" },
      actorUserId: ctx.user.id,
    })
  },
)
