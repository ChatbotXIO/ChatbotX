"use server"

import { decisionProfileService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { workspaceActionClient } from "@/lib/safe-action"
import { decisionProfileToggleSchema } from "../schema/action"

export const toggleDecisionProfileAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(decisionProfileToggleSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [workspaceId] }) => {
    await requireWorkspacePermission(workspaceId, "superAdmin")

    return await decisionProfileService.setEnabled({
      ...parsedInput,
      workspaceId,
    })
  })
