"use server"

import { questionnaireService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createQuestionnaireRequest } from "../schema/action"

export const createQuestionnaireAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createQuestionnaireRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => ({
    id: await questionnaireService.create({
      workspaceId,
      name: parsedInput.name,
    }),
  }))
