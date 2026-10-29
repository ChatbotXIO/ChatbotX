"use server"

import { mcpOAuthService } from "@chatbotx.io/business"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type RevokeMcpOAuthGrantRequest,
  revokeMcpOAuthGrantRequest,
} from "../schema/action"

export const revokeMcpOAuthGrantAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(revokeMcpOAuthGrantRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      ctx,
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      ctx: { user: { id: string } }
      parsedInput: RevokeMcpOAuthGrantRequest
    }) => {
      const revoked = await mcpOAuthService.revokeGrant({
        clientId: parsedInput.clientId,
        userId: ctx.user.id,
      })

      if (!revoked) {
        return returnValidationErrors(revokeMcpOAuthGrantRequest, {
          _errors: ["OAuth grant no longer exists"],
        })
      }

      return { workspaceId }
    },
  )
