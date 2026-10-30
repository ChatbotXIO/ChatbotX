"use server"

import { mcpOAuthService } from "@chatbotx.io/business"
import { headers } from "next/headers"
import { auth } from "@/lib/auth/auth"
import { authActionClient } from "@/lib/safe-action"
import { oauthConsentRequest } from "../schema/consent"

export const submitOAuthConsentAction = authActionClient
  .inputSchema(oauthConsentRequest)
  .action(async ({ ctx, parsedInput }) => {
    const binding = parsedInput.accept
      ? {
          userId: ctx.user.id,
          clientId: parsedInput.clientId,
          workspaceId: parsedInput.workspaceId,
        }
      : undefined
    // Reject a workspace the user cannot authorize before Better Auth records
    // the consent, so a refused pick never leaves an unbound consent.
    if (binding) {
      await mcpOAuthService.assertAuthorizableWorkspace(binding)
    }

    const result = await auth.api.oAuthConsent({
      body: {
        accept: parsedInput.accept,
        consent_code: parsedInput.consentCode,
      },
      headers: await headers(),
    })

    // The client only receives its authorization code through this redirect,
    // so the binding is in place before it can exchange the code for a token.
    if (binding) {
      await mcpOAuthService.bindConsentWorkspace(binding)
    }
    return result
  })
