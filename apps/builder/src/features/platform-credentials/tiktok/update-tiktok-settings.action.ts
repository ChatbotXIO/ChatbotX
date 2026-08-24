"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type TiktokCredential,
  tiktokCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { subscribeWebhook } from "@chatbotx.io/integration-tiktok"
import { getBrokerOrigin } from "@/lib/oauth-broker"
import { resolveTenantProviderOrigin } from "@/lib/provider-origin"
import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

export const updateTiktokSettingAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .inputSchema(tiktokCredentialUpdateSchema)
  .action(async ({ ctx, bindArgsParsedInputs: [scope], parsedInput }) => {
    const scopedUserId = resolveCredentialScopedUserId(ctx.user, scope)
    const config: TiktokCredential = {
      clientId: parsedInput.clientId,
      clientSecret: parsedInput.clientSecret,
    }

    // The webhook must be registered on the same host TikTok's push actually
    // reaches: the reseller's own custom domain for a tenant-owned (user
    // scope) credential, otherwise the broker.
    const webhookOrigin = scopedUserId
      ? await resolveTenantProviderOrigin(scopedUserId)
      : getBrokerOrigin()

    await subscribeWebhook(
      { clientId: config.clientId, clientSecret: config.clientSecret },
      new URL("/integrations/tiktok/webhook", webhookOrigin).toString(),
    )

    await platformCredentialService.upsert({
      userId: scopedUserId,
      type: "tiktok",
      config,
    })
  })
