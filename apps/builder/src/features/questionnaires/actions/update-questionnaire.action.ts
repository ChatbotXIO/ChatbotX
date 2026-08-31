"use server"

import { questionnaireService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateQuestionnaireRequest } from "../schema/action"

export const updateQuestionnaireAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(updateQuestionnaireRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    await questionnaireService.update({
      workspaceId,
      id,
      ...parsedInput,
    })
  })
