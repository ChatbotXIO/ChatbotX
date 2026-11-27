"use server"

import { savePlatformStripe } from "@chatbotx.io/business"
import { stripeCredentialUpdateSchema } from "@chatbotx.io/database/partials"
import { resolveProviderOriginForCredential } from "@/lib/provider-origin"
import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema } from "../scope"
import { resolveStripeCredentialScope } from "./scope"

/**
 * Saves the Stripe settings stores connect their account through. The
 * platform's Connect webhook is created on the account (`savePlatformStripe`),
 * so web shop payments are confirmed. The webhook
 * lives on the same origin as the Connect redirect URI: the reseller's own
 * domain for their own Stripe app, the broker otherwise.
 */
export const updateStripeSettingsAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .inputSchema(stripeCredentialUpdateSchema)
  .action(async ({ ctx, bindArgsParsedInputs: [scope], parsedInput }) => {
    const userId = await resolveStripeCredentialScope(ctx.user, scope)
    await savePlatformStripe({
      userId,
      publishableKey: parsedInput.publishableKey,
      verifyToken: parsedInput.verifyToken,
      secretKey: parsedInput.secretKey,
      connectClientId: parsedInput.connectClientId,
      webhookOrigin: await resolveProviderOriginForCredential({
        userId: userId ?? null,
      }),
    })
  })
