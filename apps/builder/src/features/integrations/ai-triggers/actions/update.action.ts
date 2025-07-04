"use server"

import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { AITriggerException } from "@/features/integrations/ai-triggers/schemas/errors.schema"
import {
  type UpdateAITriggerRequest,
  updateAITriggerRequest,
} from "@/features/integrations/ai-triggers/schemas/update.schema"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma, type Prisma } from "@ahachat.ai/database"
import type { UserModel } from "@ahachat.ai/database/types"
import { revalidateTag } from "next/cache"

export const updateAITriggerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
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

      revalidateTag(`chatbots:${chatbotId}#aiTriggers`)
    },
  )
