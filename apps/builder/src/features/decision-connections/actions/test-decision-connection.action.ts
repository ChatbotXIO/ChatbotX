"use server"

import { decisionConnectionService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { workspaceActionClient } from "@/lib/safe-action"
import { decisionConnectionToggleSchema } from "../schema/action"

export const testDecisionConnectionAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(decisionConnectionToggleSchema.pick({ id: true }))
  .action(async ({ parsedInput, bindArgsParsedInputs: [workspaceId] }) => {
    await requireWorkspacePermission(workspaceId, "superAdmin")
    return await decisionConnectionService.test({ ...parsedInput, workspaceId })
  })
