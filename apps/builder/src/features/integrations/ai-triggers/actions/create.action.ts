"use server"

import { type Prisma, prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
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

export const createAITriggerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(createAITriggerRequest)
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
          questions: parsedInput.questions as Prisma.InputJsonValue[],
          chatbotId,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#aiTriggers`)
    },
  )
