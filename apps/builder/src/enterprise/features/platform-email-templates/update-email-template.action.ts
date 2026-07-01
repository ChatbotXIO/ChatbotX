"use server"

import { tenantService } from "@chatbotx.io/business"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import type { TenantModel, UserModel } from "@chatbotx.io/database/types"
import {
  platformAdminActionClient,
  superAdminActionClient,
} from "@/lib/safe-action"
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

const toTemplateUpdate = (input: UpdateEmailTemplateSchema) => {
  const key = templateKeyMap[input.type]
  const template = input.body?.trim()
    ? { subject: input.subject ?? undefined, body: input.body }
    : null
  return { [key]: template }
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
      await tenantService.upsertByOwner(
        ctx.user.id,
        toTemplateUpdate(parsedInput),
      )
    },
  )

export const updateRootEmailTemplateAction = superAdminActionClient
  .inputSchema(updateEmailTemplateSchema)
  .action(
    async ({ parsedInput }: { parsedInput: UpdateEmailTemplateSchema }) => {
      await tenantService.upsertById(
        ROOT_TENANT_ID,
        toTemplateUpdate(parsedInput),
      )
    },
  )
