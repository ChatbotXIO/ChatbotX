"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import {
  type CreateAITriggerRequest,
  createAITriggerRequest,
} from "@/features/integrations/ai-triggers/schemas/create.schema"
import { AITriggerException } from "@/features/integrations/ai-triggers/schemas/errors.schema"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import type { JsonObject } from "@prisma/client/runtime/binary"
import { revalidateTag } from "next/cache"

export const createAITriggerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .schema(createAITriggerRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateAITriggerRequest
    }) => {
      const existingAITrigger = await prisma.aITrigger.findFirst({
        select: {
          id: true,
        },
        where: {
          name: parsedInput.name,
          chatbotId,
        },
      })

      if (existingAITrigger) {
        throw new AITriggerException(
          `AI Trigger with the name "${parsedInput.name}" already exists.`,
        )
      }

      await prisma.aITrigger.create({
        data: {
          ...parsedInput,
          questions: parsedInput.questions as JsonObject[],
          chatbotId,
        },
      })

      revalidateTag(`chatbot:${chatbotId}#aiTriggers`)
    },
  )
