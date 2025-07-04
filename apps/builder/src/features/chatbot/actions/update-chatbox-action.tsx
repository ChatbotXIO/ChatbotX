"use server"

import {
  chatbotIdRequestParams,
  type ChatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import {
  updateChatbotAdvancedRequest,
  type UpdateChatbotAdvancedRequest,
  type UpdateChatbotBasicRequest,
  updateChatbotBasicRequest,
} from "../schemas/update-chatbot-schema"

export const updateChatbotBasicAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
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
  .bindArgsSchemas(chatbotIdRequestParams.items)
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
