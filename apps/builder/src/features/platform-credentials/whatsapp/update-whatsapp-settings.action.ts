"use server"

import { platformCredentialService } from "@chatbotx.io/business"
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
    const config: WhatsappCredential = {
      clientId: parsedInput.clientId,
      version: parsedInput.version,
      configId: parsedInput.configId,
      systemUserId: parsedInput.systemUserId,
      businessId: parsedInput.businessId,
      businessName: parsedInput.businessName,
      verifyToken: parsedInput.verifyToken,
      clientSecret: parsedInput.clientSecret,
      systemUserToken: parsedInput.systemUserToken,
    }

    await platformCredentialService.upsert({
      userId: scopedUserId,
      type: "whatsapp",
      config,
    })

    const callsSubscriptionWarning = await ensureCallsWebhookSubscribed(config)

    return { callsSubscriptionWarning }
  })
