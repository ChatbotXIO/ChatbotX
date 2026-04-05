"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationGeminiModel } from "@chatbotx.io/database/schema"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateGeminiRequest,
  updateGeminiRequest,
} from "../schemas/request"

export const updateGeminiAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateGeminiRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: UpdateGeminiRequest
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationGemini = await findOrFail({
        table: integrationGeminiModel,
        where: { workspaceId },
        message: "Integration Gemini not found",
      })

      await db
        .update(integrationGeminiModel)
        .set(parsedInput)
        .where(eq(integrationGeminiModel.id, integrationGemini.id))
    },
  )
