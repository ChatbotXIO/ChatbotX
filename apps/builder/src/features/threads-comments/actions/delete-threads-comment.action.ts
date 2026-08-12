"use server"

import { fbCommentAutomationService } from "@chatbotx.io/business"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas/index"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const deleteThreadsCommentAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      await fbCommentAutomationService.deleteThreadsAutomation({
        workspaceId,
        id,
      })
    },
  )
