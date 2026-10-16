"use server"

import { decisionConnectionService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type DecisionConnectionAction,
  decisionConnectionActionSchema,
} from "../schema/action"

export const createDecisionConnectionAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(decisionConnectionActionSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: DecisionConnectionAction
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      await requireWorkspacePermission(workspaceId, "superAdmin")
      if (!parsedInput.credential) {
        throw new Error("Decision credential is required")
      }
      return await decisionConnectionService.create({
        ...parsedInput,
        workspaceId,
      })
    },
  )
