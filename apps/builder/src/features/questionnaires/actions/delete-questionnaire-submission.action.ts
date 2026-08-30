"use server"

import { questionnaireSubmissionService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { deleteQuestionnaireSubmissionRequest } from "../schema/action"

export const deleteQuestionnaireSubmissionAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(deleteQuestionnaireSubmissionRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    await questionnaireSubmissionService.deleteSubmission({
      workspaceId,
      questionnaireId: parsedInput.questionnaireId,
      submissionId: parsedInput.submissionId,
    })
  })
