"use server"

import { AITriggerException } from "@/features/integrations/ai-triggers/schemas/errors.schema"
import {
  type UpdateAITriggerBindSchema,
  type UpdateAITriggerSchema,
  updateAITriggerBindSchema,
  updateAITriggerSchema,
} from "@/features/integrations/ai-triggers/schemas/update.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import type { JsonObject } from "@prisma/client/runtime/binary"
import { revalidateTag } from "next/cache"

export const updateAITriggerAction = authActionClient
  .schema(updateAITriggerSchema)
  .bindArgsSchemas(updateAITriggerBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, triggerId],
    }: {
      ctx: { user: User }
      parsedInput: UpdateAITriggerSchema
      bindArgsParsedInputs: UpdateAITriggerBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAITrigger = await prisma.aITrigger.findFirst({
        select: {
          id: true,
        },
        where: {
          description: parsedInput.name,
          chatbotId,
          id: {
            not: triggerId,
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
          id: triggerId,
        },
        data: {
          ...parsedInput,
          questions: parsedInput.questions as JsonObject[],
        },
      })

      revalidateTag(`${ctx.user.id}#aiTriggers`)

      return {
        successful: true,
      }
    },
  )
