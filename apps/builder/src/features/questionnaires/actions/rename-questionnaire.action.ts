"use server"

import { questionnaireService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { renameQuestionnaireRequest } from "../schemas/action"

export const renameQuestionnaireAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(renameQuestionnaireRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    await questionnaireService.rename({
      workspaceId,
      id,
      name: parsedInput.name,
    })
  })
