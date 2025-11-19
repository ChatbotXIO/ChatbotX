"use server"

import { type Prisma, prisma } from "@aha.chat/database"
import type { UserModel } from "@aha.chat/database/types"
import { AITriggerException } from "@/features/ai-triggers/schemas/errors.schema"
import {
  type UpdateAITriggerRequest,
  updateAITriggerRequest,
} from "@/features/ai-triggers/schemas/update.schema"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const updateAITriggerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateAITriggerRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      ctx: { user: UserModel }
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateAITriggerRequest
    }) => {
      const existingAITrigger = await prisma.aITrigger.findFirst({
        select: {
          id: true,
        },
        where: {
          name: parsedInput.name,
          chatbotId,
          id: {
            not: id,
          },
        },
      })

      if (existingAITrigger) {
        throw new AITriggerException(
          `AITrigger with the name "${parsedInput.name}" already exists.`,
        )
      }

      await prisma.aITrigger.update({
        where: {
          id,
        },
        data: {
          ...parsedInput,
          questions: parsedInput.questions as Prisma.InputJsonValue[],
        },
      })

      revalidateCacheTags(`chatbots:${chatbotId}#aiTriggers`)
    },
  )
