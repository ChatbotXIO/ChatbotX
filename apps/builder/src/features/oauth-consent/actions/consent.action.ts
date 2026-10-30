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
      return await auth.api.oauth2Consent({
        body: {
          accept: false,
          oauth_query: parsedInput.oauthQuery,
        },
        headers: await headers(),
      })
    }

    const clientId = new URLSearchParams(parsedInput.oauthQuery).get(
      "client_id",
    )
    if (!clientId) {
      throw new Error("OAuth query does not include a client id")
    }
    const binding = {
      clientId,
      user: ctx.user,
      workspaceId: parsedInput.workspaceId,
    }

    await mcpOAuthService.assertAuthorizableWorkspace(binding)
    const result = await auth.api.oauth2Consent({
      body: {
        accept: true,
        oauth_query: parsedInput.oauthQuery,
      },
      headers: await headers(),
    })
    await mcpOAuthService.bindConsentWorkspace(binding)
    return result
  })
