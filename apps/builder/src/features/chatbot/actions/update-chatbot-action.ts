"use server"

import { db, eq } from "@aha.chat/database/client"
import { chatbotModel } from "@aha.chat/database/schema"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateChatbotAdvancedRequest,
  type UpdateChatbotBasicRequest,
  updateChatbotAdvancedRequest,
  updateChatbotBasicRequest,
} from "../schemas/update-chatbot-schema"

export const updateChatbotBasicAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(updateChatbotBasicRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: UpdateChatbotBasicRequest
    }) => {
      await db
        .update(chatbotModel)
        .set(parsedInput)
        .where(eq(chatbotModel.id, chatbotId))
    },
  )

export const updateChatbotAdvancedAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(updateChatbotAdvancedRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: UpdateChatbotAdvancedRequest
    }) => {
      await db
        .update(chatbotModel)
        .set(parsedInput)
        .where(eq(chatbotModel.id, chatbotId))
    },
  )
