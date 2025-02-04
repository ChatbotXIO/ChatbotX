"use server"

import { authActionClient } from "@/lib/safe-action"
import { type UpdateAiTriggerSchema, type UpdateAiTriggerBindSchema, updateAiTriggerBindSchema, updateAiTriggerSchema } from "@/features/integrations/ai-triggers/schemas/update.schema";
import { prisma, User } from "@ahachat.ai/database"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { AiTriggerException } from "@/features/integrations/ai-triggers/schemas/errors.schema"
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
          description: parsedInput.name,
        },
      })

      revalidateTag(`${ctx.user.id}#AiTrigger`)

      return {
        successful: true,
      }
    },
  )
