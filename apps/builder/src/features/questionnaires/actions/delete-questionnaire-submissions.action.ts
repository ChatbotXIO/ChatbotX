"use server"

import { questionnaireSubmissionService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { deleteQuestionnaireSubmissionsRequest } from "../schema/action"

export const deleteQuestionnaireSubmissionsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(deleteQuestionnaireSubmissionsRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    await questionnaireSubmissionService.deleteSubmissions({
      workspaceId,
      questionnaireId: parsedInput.questionnaireId,
      submissionIds: parsedInput.submissionIds,
    })
  })
