"use server"

import { authActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import {
  type UpdateChatbotBindSchema,
  updateChatbotBindSchema,
  type UpdateChatbotSchema,
  updateChatbotSchema,
} from "./update-chatbot-schema"

export const updateChatbotAction = authActionClient
  .schema(updateChatbotSchema)
  .bindArgsSchemas(updateChatbotBindSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: UpdateChatbotSchema
      bindArgsParsedInputs: UpdateChatbotBindSchema
    }) => {
      await prisma.chatbot.update({
        where: { id: chatbotId },
        data: {
          defaultReply: parsedInput.defaultReply,
          targetCountry: parsedInput.targetCountry,
          defaultLanguage: parsedInput.defaultLanguage,
          accountTimezone: parsedInput.accountTimezone,
          brandColor: parsedInput.brandColor,
          developmentMode: parsedInput.developmentMode,
        },
      })

      return {
        successful: true,
      }
    },
  )
