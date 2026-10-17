"use server"

import { decisionProfileService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { workspaceActionClient } from "@/lib/safe-action"
import { decisionProfileActionSchema } from "../schema/action"

export const createDecisionProfileAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(decisionProfileActionSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: typeof decisionProfileActionSchema._output
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      await requireWorkspacePermission(workspaceId, "superAdmin")

      return await decisionProfileService.create({
        ...parsedInput,
        workspaceId,
      })
    },
  )
