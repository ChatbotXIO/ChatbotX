"use server"

import { listConnectedCallSummaryProviders } from "@chatbotx.io/ai/server"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { listIntegrationOpenaiCompatible } from "@/features/integration-openai-compatible/queries"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

/**
 * The AI integrations a member can write with: connected providers plus
 * enabled OpenAI-compatible ones. A read only (the generate call itself is
 * refused in an expired workspace), so it stays allowed after expiry. Like the
 * generate procedure, it needs the `broadcast` page permission.
 */
export const listAiIntegrationsAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString()])
  .action(async ({ bindArgsParsedInputs: [workspaceId], ctx }) => {
    if (!hasWorkspacePermission(ctx.workspaceMemberPermissions, "broadcast")) {
      throw new ChatbotXException(
        "You do not have permission to perform this action",
        "forbidden",
        403,
      )
    }
    const [providers, compatible] = await Promise.all([
      listConnectedCallSummaryProviders(workspaceId),
      listIntegrationOpenaiCompatible({ workspaceId }),
    ])
    return {
      openaiCompatible: compatible.filter((integration) => integration.enabled),
      providers,
    }
  })
