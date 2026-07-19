"use server"

import { questionnaireService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { createQuestionnaireRequest } from "../schemas/action"

export const createQuestionnaireAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createQuestionnaireRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => ({
    id: await questionnaireService.create({
      workspaceId,
      name: parsedInput.name,
    }),
  }))
