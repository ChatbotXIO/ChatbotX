"use server"

import { mcpOAuthService } from "@chatbotx.io/business"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"
import { revokeMcpOAuthGrantRequest } from "../schema/action"

export const revokeMcpOAuthGrantAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(revokeMcpOAuthGrantRequest)
  .action(async ({ ctx, parsedInput }) => {
    const revoked = await mcpOAuthService.revokeGrant({
      clientId: parsedInput.clientId,
      userId: ctx.user.id,
    })

    if (!revoked) {
      const t = await getTranslations()
      return returnValidationErrors(revokeMcpOAuthGrantRequest, {
        _errors: [t("chatbotxMcp.grants.notFound")],
      })
    }
  })
