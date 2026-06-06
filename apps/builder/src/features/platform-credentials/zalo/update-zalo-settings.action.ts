"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type ZaloCredential,
  zaloCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { getTranslations } from "next-intl/server"

import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

export const updateZaloSettingsAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .inputSchema(zaloCredentialUpdateSchema)
  .action(async ({ ctx, bindArgsParsedInputs: [scope], parsedInput }) => {
    const scopedUserId = resolveCredentialScopedUserId(ctx.user, scope)
    const existing = await platformCredentialService.findDecrypted({
      userId: scopedUserId,
      type: "zalo",
    })

    const t = await getTranslations()

    const clientSecret =
      parsedInput.clientSecret || existing?.config.clientSecret
    if (!clientSecret) {
      throw new Error(t("platformSettings.errors.zaloAppSecretRequired"))
    }

    const config: ZaloCredential = {
      clientId: parsedInput.clientId,
      version: parsedInput.version,
      verifyToken: parsedInput.verifyToken,
      clientSecret,
    }

    await platformCredentialService.upsert({
      userId: scopedUserId,
      type: "zalo",
      config,
    })
  })
