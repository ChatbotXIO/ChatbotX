"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type TiktokCredential,
  tiktokCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { subscribeWebhook } from "@chatbotx.io/integration-tiktok"
import { getTranslations } from "next-intl/server"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

export const updateTiktokSettingAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .inputSchema(tiktokCredentialUpdateSchema)
  .action(async ({ ctx, bindArgsParsedInputs: [scope], parsedInput }) => {
    const scopedUserId = resolveCredentialScopedUserId(ctx.user, scope)
    const existing = await platformCredentialService.findDecrypted({
      userId: scopedUserId,
      type: "tiktok",
    })

    const t = await getTranslations()

    const clientSecret =
      parsedInput.clientSecret || existing?.config.clientSecret
    if (!clientSecret) {
      throw new Error(t("platformSettings.errors.tiktokAppSecretRequired"))
    }

    const config: TiktokCredential = {
      clientId: parsedInput.clientId,
      clientSecret,
    }

    await subscribeWebhook(
      { clientId: config.clientId, clientSecret },
      buildBrokerCallbackUrl("/integrations/tiktok/webhook"),
    )

    await platformCredentialService.upsert({
      userId: scopedUserId,
      type: "tiktok",
      config,
    })
  })
