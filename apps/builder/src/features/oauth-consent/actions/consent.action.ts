"use server"

import { mcpOAuthService } from "@chatbotx.io/business"
import { headers } from "next/headers"
import { auth } from "@/lib/auth/auth"
import { authActionClient } from "@/lib/safe-action"
import { oauthConsentRequest } from "../schema/consent"

export const submitOAuthConsentAction = authActionClient
  .inputSchema(oauthConsentRequest)
  .action(async ({ ctx, parsedInput }) => {
    if (!parsedInput.accept) {
      return await auth.api.oAuthConsent({
        body: {
          accept: false,
          consent_code: parsedInput.consentCode,
        },
        headers: await headers(),
      })
    }

    const consentRequest = await mcpOAuthService.resolveConsentRequest({
      consentCode: parsedInput.consentCode,
      userId: ctx.user.id,
    })
    const binding = {
      clientId: consentRequest.clientId,
      user: ctx.user,
      workspaceId: parsedInput.workspaceId,
    }

    // Reject a workspace the user cannot authorize before Better Auth records
    // the consent, so a refused pick never leaves an unbound consent.
    await mcpOAuthService.assertAuthorizableWorkspace(binding)

    const result = await auth.api.oAuthConsent({
      body: {
        accept: true,
        consent_code: parsedInput.consentCode,
      },
      headers: await headers(),
    })

    // The client only receives its authorization code through this redirect,
    // so the binding is in place before it can exchange the code for a token.
    await mcpOAuthService.bindConsentWorkspace(binding)
    return result
  })
