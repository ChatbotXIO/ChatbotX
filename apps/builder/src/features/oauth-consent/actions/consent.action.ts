"use server"

import { verifyMcpOAuthQuery } from "@chatbotx.io/auth/mcp-resource"
import { mcpOAuthService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { headers } from "next/headers"
import { auth } from "@/lib/auth/auth"
import { logger } from "@/lib/log"
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

    // Check the pick before approving so a refused workspace never leaves a
    // consent behind.
    await mcpOAuthService.assertAuthorizableWorkspace(binding)
    const result = await auth.api.oauth2Consent({
      body: {
        accept: true,
        oauth_query: parsedInput.oauthQuery,
      },
      headers: await headers(),
    })
    // Bind before the redirect reaches the client. Better Auth reuses a stored
    // consent without showing this page again, so an unbound one must not
    // survive a failed bind: revoke it and let the next attempt re-prompt.
    try {
      await mcpOAuthService.bindConsentWorkspace(binding)
    } catch (error) {
      logger.error(
        { err: error, clientId: binding.clientId, userId: ctx.user.id },
        "Failed to bind MCP OAuth consent to workspace; revoking consent",
      )
      await mcpOAuthService.revokeGrant({
        userId: ctx.user.id,
        clientId: binding.clientId,
      })
      throw error
    }
    return result
  })
