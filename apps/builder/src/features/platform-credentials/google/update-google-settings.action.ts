"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type GoogleCredential,
  googleCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { getTranslations } from "next-intl/server"

import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

export const updateGoogleSettingsAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .inputSchema(googleCredentialUpdateSchema)
  .action(async ({ ctx, bindArgsParsedInputs: [scope], parsedInput }) => {
    const scopedUserId = resolveCredentialScopedUserId(ctx.user, scope)
    const existing = await platformCredentialService.findDecrypted({
      userId: scopedUserId,
      type: "google",
    })

    const t = await getTranslations()

    const clientSecret =
      parsedInput.clientSecret || existing?.config.clientSecret
    if (!clientSecret) {
      throw new Error(t("platformSettings.errors.googleClientSecretRequired"))
    }

    const verifyToken = parsedInput.verifyToken || existing?.config.verifyToken
    if (!verifyToken) {
      throw new Error(t("platformSettings.errors.googleVerifyTokenRequired"))
    }

    const config: GoogleCredential = {
      clientId: parsedInput.clientId,
      clientSecret,
      verifyToken,
    }

    await platformCredentialService.upsert({
      userId: scopedUserId,
      type: "google",
      config,
    })
  })
