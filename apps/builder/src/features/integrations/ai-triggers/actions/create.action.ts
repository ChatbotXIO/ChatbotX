"use server"

import {
  type ChatbotIdBindSchema,
  chatbotIdBindSchema,
} from "@/features/chatbots/schemas"
import {
  type CreateAITriggerSchema,
  createAITriggerSchema,
} from "@/features/integrations/ai-triggers/schemas/create.schema"
import { AITriggerException } from "@/features/integrations/ai-triggers/schemas/errors.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import type { JsonObject } from "@prisma/client/runtime/binary"
import { revalidateTag } from "next/cache"

export const createAITriggerAction = authActionClient
  .schema(createAITriggerSchema)
  .bindArgsSchemas(chatbotIdBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: User }
      parsedInput: CreateAITriggerSchema
      bindArgsParsedInputs: ChatbotIdBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

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

      revalidateTag(`${ctx.user.id}#aiTriggers`)

      return {
        successful: true,
      }
    },
  )
