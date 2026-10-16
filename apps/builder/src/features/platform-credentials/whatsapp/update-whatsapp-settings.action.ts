"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  type WhatsappCredential,
  whatsappCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { getTranslations } from "next-intl/server"
import { ensureWhatsappCallsWebhookSubscribed } from "@/features/integration-whatsapp/libs/ensure-calls-webhook-subscribed"
import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

/**
 * Best-effort app-level `calls` webhook field subscription right after the
 * app credentials are saved. Never fails the settings save
 * — a failure here only means the Calls-card preflight keeps surfacing
 * "not subscribed" for a super-admin to retry.
 */
async function ensureCallsWebhookSubscribed(
  config: Pick<WhatsappCredential, "clientId" | "clientSecret" | "verifyToken">,
): Promise<string | undefined> {
  const t = await getTranslations()

  try {
    const result = await ensureWhatsappCallsWebhookSubscribed({
      appId: config.clientId,
      appSecret: config.clientSecret,
      verifyToken: config.verifyToken,
    })

    if (result.status === "no-subscription") {
      return t("whatsapp.calls.preflight.appSubscriptionMissing")
    }

    return
  } catch (err) {
    logger.warn(
      { err, appId: config.clientId },
      "Unable to subscribe app-level 'calls' webhook field after saving WhatsApp settings",
    )
    return t("whatsapp.calls.preflight.appSubscriptionFailed")
  }
}

export const updateWhatsappSettingsAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .inputSchema(whatsappCredentialUpdateSchema)
  .action(async ({ ctx, bindArgsParsedInputs: [scope], parsedInput }) => {
    const scopedUserId = resolveCredentialScopedUserId(ctx.user, scope)

    // A blank secret keeps the stored one, so the existing credential is only
    // read then — `strict` so a transient read/decrypt failure aborts the save
    // instead of silently dropping a secret. A fully re-submitted credential
    // needs no read, so it can overwrite an undecryptable row.
    const needsStored = !(
      parsedInput.clientSecret && parsedInput.systemUserToken
    )
    const stored = needsStored
      ? (
          await platformCredentialService.findDecrypted({
            userId: scopedUserId,
            type: "whatsapp",
            strict: true,
          })
        )?.config
      : undefined

    const clientSecret = parsedInput.clientSecret || stored?.clientSecret
    const systemUserToken =
      parsedInput.systemUserToken || stored?.systemUserToken
    if (!(clientSecret && systemUserToken)) {
      const t = await getTranslations()
      throw new ChatbotXException(
        t("whatsapp.credentialSecretsRequired"),
        "whatsapp.credentialSecretsRequired",
        422,
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
      capiConfigId: parsedInput.capiConfigId,
    }

    await platformCredentialService.upsert({
      userId: scopedUserId,
      type: "whatsapp",
      config,
    })

    const callsSubscriptionWarning = await ensureCallsWebhookSubscribed(config)

    return { callsSubscriptionWarning }
  })
