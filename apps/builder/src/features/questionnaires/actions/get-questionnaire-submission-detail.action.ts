"use server"

import { questionnaireSubmissionService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { deleteQuestionnaireSubmissionRequest } from "../schemas/action"

export const getQuestionnaireSubmissionDetailAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(deleteQuestionnaireSubmissionRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
    questionnaireSubmissionService.detail({
      workspaceId,
      questionnaireId: parsedInput.questionnaireId,
      submissionId: parsedInput.submissionId,
    }),
  )
