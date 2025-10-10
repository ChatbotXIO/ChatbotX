"use server"

import { prisma } from "@aha.chat/database"
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
      await prisma.chatbot.update({
        where: { id: chatbotId },
        data: parsedInput,
      })
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
      await prisma.chatbot.update({
        where: { id: chatbotId },
        data: parsedInput,
      })
    },
  )
