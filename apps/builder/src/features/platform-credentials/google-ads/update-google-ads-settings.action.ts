"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  type GoogleAdsCredential,
  googleAdsCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { getTranslations } from "next-intl/server"

import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

export const updateGoogleAdsSettingsAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .inputSchema(googleAdsCredentialUpdateSchema)
  .action(async ({ ctx, bindArgsParsedInputs: [scope], parsedInput }) => {
    const scopedUserId = resolveCredentialScopedUserId(ctx.user, scope)

    // A blank secret or developer token keeps the stored one, so only then is
    // the existing credential read — `strict` so a transient read/decrypt failure aborts the
    // save instead of silently dropping a secret. A fully re-submitted
    // credential needs no read, so it can overwrite an undecryptable row.
    const needsStored = !(
      parsedInput.clientSecret && parsedInput.developerToken
    )
    const stored = needsStored
      ? (
          await platformCredentialService.findDecrypted({
            userId: scopedUserId,
            type: "googleAds",
            strict: true,
          })
        )?.config
      : undefined

    const clientSecret = parsedInput.clientSecret || stored?.clientSecret
    // Optional: Google ignores the developer token, so none may be stored.
    const developerToken = parsedInput.developerToken || stored?.developerToken
    const uploadMethod = parsedInput.uploadMethod ?? stored?.uploadMethod
    if (!clientSecret) {
      const t = await getTranslations()
      throw new ChatbotXException(
        t("googleAds.errors.credentialSecretsRequired"),
        "googleAds.credentialSecretsRequired",
        422,
      )
    }

    const config: GoogleAdsCredential = {
      clientId: parsedInput.clientId,
      clientSecret,
      ...(developerToken ? { developerToken } : {}),
      ...(uploadMethod ? { uploadMethod } : {}),
    }

    await platformCredentialService.upsert({
      userId: scopedUserId,
      type: "googleAds",
      config,
    })
  })
