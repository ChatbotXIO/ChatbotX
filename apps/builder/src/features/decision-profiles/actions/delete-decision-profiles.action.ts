"use server"

import { decisionProfileService } from "@chatbotx.io/business"
import {
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteDecisionProfilesAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    await requireWorkspacePermission(workspaceId, "superAdmin")

    await decisionProfileService.deleteMany({
      ids: parsedInput.ids,
      workspaceId,
    })
  })
