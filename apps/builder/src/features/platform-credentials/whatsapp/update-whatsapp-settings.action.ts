"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type WhatsappCredential,
  whatsappCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { getTranslations } from "next-intl/server"

import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

export const updateWhatsappSettingsAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .inputSchema(whatsappCredentialUpdateSchema)
  .action(async ({ ctx, bindArgsParsedInputs: [scope], parsedInput }) => {
    const scopedUserId = resolveCredentialScopedUserId(ctx.user, scope)
    const existing = await platformCredentialService.findDecrypted({
      userId: scopedUserId,
      type: "whatsapp",
    })

    const t = await getTranslations()

    const clientSecret =
      parsedInput.clientSecret || existing?.config.clientSecret
    if (!clientSecret) {
      throw new Error(t("platformSettings.errors.whatsappAppSecretRequired"))
    }

    const systemUserToken =
      parsedInput.systemUserToken || existing?.config.systemUserToken
    if (!systemUserToken) {
      throw new Error(
        t("platformSettings.errors.whatsappSystemUserTokenRequired"),
      )
    }

    const config: WhatsappCredential = {
      clientId: parsedInput.clientId,
      version: parsedInput.version,
      configId: parsedInput.configId,
      systemUserId: parsedInput.systemUserId,
      businessId: parsedInput.businessId,
      businessName: parsedInput.businessName,
      verifyToken: parsedInput.verifyToken,
      clientSecret,
      systemUserToken,
    }

    await platformCredentialService.upsert({
      userId: scopedUserId,
      type: "whatsapp",
      config,
    })
  })
