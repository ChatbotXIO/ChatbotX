"use server"

import { verifyMcpOAuthQuery } from "@chatbotx.io/auth/mcp-resource"
import { mcpOAuthService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
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

    const verified = await verifyMcpOAuthQuery(parsedInput.oauthQuery)
    if (!verified) {
      throw new ChatbotXException(
        "OAuth consent request is invalid or expired",
        "forbidden",
        403,
      )
    }
    const binding = {
      clientId: verified.clientId,
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
