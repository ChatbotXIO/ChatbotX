"use server"

import { tenantService } from "@chatbotx.io/business"
import type { TenantModel, UserModel } from "@chatbotx.io/database/types"
import { platformAdminActionClient } from "@/lib/safe-action"
import {
  type EmailTemplateType,
  type UpdateEmailTemplateSchema,
  updateEmailTemplateSchema,
} from "./email-template.schema"

const templateKeyMap: Record<
  EmailTemplateType,
  keyof Pick<
    TenantModel,
    | "signupEmailTemplate"
    | "forgotPasswordEmailTemplate"
    | "magicLinkEmailTemplate"
  >
> = {
  signup: "signupEmailTemplate",
  forgotPassword: "forgotPasswordEmailTemplate",
  magicLink: "magicLinkEmailTemplate",
}

export const updateEmailTemplateAction = platformAdminActionClient
  .inputSchema(updateEmailTemplateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: UpdateEmailTemplateSchema
    }) => {
      const key = templateKeyMap[parsedInput.type]
      const template = parsedInput.body?.trim()
        ? { subject: parsedInput.subject ?? undefined, body: parsedInput.body }
        : null

      await tenantService.upsertByOwner(ctx.user.id, {
        [key]: template,
      })
    },
  )
