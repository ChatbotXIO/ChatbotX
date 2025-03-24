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
import { type User, prisma } from "@ahachat.ai/database"
import type { JsonObject } from "@prisma/client/runtime/binary"
import { revalidateTag } from "next/cache"

export const updateAITriggerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .schema(updateAITriggerRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      ctx: { user: User }
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
          questions: parsedInput.questions as JsonObject[],
        },
      })

      revalidateTag(`chatbots:${chatbotId}#aiTriggers`)
    },
  )
