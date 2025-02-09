"use server"

import { AiTriggerException } from "@/features/integrations/ai-triggers/schemas/errors.schema"
import {
  type UpdateAiTriggerBindSchema,
  type UpdateAiTriggerSchema,
  updateAiTriggerBindSchema,
  updateAiTriggerSchema,
} from "@/features/integrations/ai-triggers/schemas/update.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import type { JsonObject } from "@prisma/client/runtime/binary"
import { revalidateTag } from "next/cache"

export const updateAiTriggerAction = authActionClient
  .schema(updateAiTriggerSchema)
  .bindArgsSchemas(updateAiTriggerBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, triggerId],
    }: {
      ctx: { user: User }
      parsedInput: UpdateAiTriggerSchema
      bindArgsParsedInputs: UpdateAiTriggerBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAiTrigger = await prisma.aiTrigger.findFirst({
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

      if (existingAiTrigger) {
        throw new AiTriggerException(
          `AiTrigger with the name "${parsedInput.name}" already exists.`,
        )
      }

      await prisma.aiTrigger.update({
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
