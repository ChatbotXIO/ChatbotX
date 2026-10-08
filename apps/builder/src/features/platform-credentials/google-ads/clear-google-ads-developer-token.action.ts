"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { GoogleAdsCredential } from "@chatbotx.io/database/partials"
import { getTranslations } from "next-intl/server"

import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

/**
 * Drops only the stored developer token, keeping the client id, client secret
 * and upload method. `strict` so an unreadable row aborts instead of being
 * overwritten with a partial credential.
 */
export const clearGoogleAdsDeveloperTokenAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .action(async ({ ctx, bindArgsParsedInputs: [scope] }) => {
    const userId = resolveCredentialScopedUserId(ctx.user, scope)

    const stored = (
      await platformCredentialService.findDecrypted({
        userId,
        type: "googleAds",
        strict: true,
      })
    )?.config

    if (!stored) {
      const t = await getTranslations()
      throw new ChatbotXException(
        t("googleAds.errors.credentialSecretsRequired"),
        "googleAds.credentialSecretsRequired",
        422,
      )
    }

    const { developerToken: _removed, ...config }: GoogleAdsCredential = stored

    await platformCredentialService.upsert({
      userId,
      type: "googleAds",
      config,
    })
  })
