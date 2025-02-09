"use server"

import {
  type CreateAiTriggerBindSchema,
  type CreateAiTriggerSchema,
  createAiTriggerBindSchema,
  createAiTriggerSchema,
} from "@/features/integrations/ai-triggers/schemas/create.schema"
import { AiTriggerException } from "@/features/integrations/ai-triggers/schemas/errors.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import type { JsonObject } from "@prisma/client/runtime/binary"

export const createAiTriggerAction = authActionClient
  .schema(createAiTriggerSchema)
  .bindArgsSchemas(createAiTriggerBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: User }
      parsedInput: CreateAiTriggerSchema
      bindArgsParsedInputs: CreateAiTriggerBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAiTrigger = await prisma.aiTrigger.findFirst({
        select: {
          id: true,
        },
        where: {
          // name: parsedInput.name,
          chatbotId,
        },
      })

      if (existingAiTrigger) {
        throw new AiTriggerException(
          `Ai Trigger with the name "${parsedInput.name}" already exists.`,
        )
      }

      await prisma.aiTrigger.create({
        data: {
          // ...parsedInput,
          description: parsedInput.description,
          questions: parsedInput.questions as JsonObject[],
          flowId: parsedInput.flowId,
          finalMessage: parsedInput.finalMessage,
          chatbotId,
        },
      })

      revalidateTag(`${ctx.user.id}#aiTriggers`)

      return {
        successful: true,
      }
    },
  )
