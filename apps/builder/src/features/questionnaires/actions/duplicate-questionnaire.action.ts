"use server"

import { questionnaireService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const duplicateQuestionnaireAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id] }) => ({
    id: await questionnaireService.duplicate({
      workspaceId,
      id,
    }),
  }))
