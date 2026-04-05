"use server"

import { db, eq } from "@chatbotx.io/database/client"
import { workspaceModel } from "@chatbotx.io/database/schema"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateChatbotAdvancedRequest,
  type UpdateChatbotBasicRequest,
  updateChatbotAdvancedRequest,
  updateChatbotBasicRequest,
} from "../schema/update-workspace-schema"

export const updateChatbotBasicAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateChatbotBasicRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: UpdateChatbotBasicRequest
    }) => {
      await db
        .update(workspaceModel)
        .set(parsedInput)
        .where(eq(workspaceModel.id, workspaceId))
    },
  )

export const updateChatbotAdvancedAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateChatbotAdvancedRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: UpdateChatbotAdvancedRequest
    }) => {
      await db
        .update(workspaceModel)
        .set(parsedInput)
        .where(eq(workspaceModel.id, workspaceId))
    },
  )
