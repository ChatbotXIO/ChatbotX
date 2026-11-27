"use server"

import { removePlatformStripe } from "@chatbotx.io/business"
import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema } from "../scope"
import { resolveStripeCredentialScope } from "./scope"

/** Removes the Stripe settings and their Connect webhook. */
export const deleteStripeSettingsAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .action(async ({ ctx, bindArgsParsedInputs: [scope] }) => {
    await removePlatformStripe({
      userId: await resolveStripeCredentialScope(ctx.user, scope, {
        allowWithoutEntitlement: true,
      }),
    })
  })
