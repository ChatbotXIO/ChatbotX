"use server"

import { authActionClient } from "@/lib/safe-action"
import {
  type CreateAiTriggerSchema,
  type CreateAiTriggerBindSchema,
  createAiTriggerSchema,
  createAiTriggerBindSchema
} from "@/features/integrations/ai-triggers/schemas/create.schema";
import { prisma, User } from "@ahachat.ai/database"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { AiTriggerException } from "@/features/integrations/ai-triggers/schemas/errors.schema";
import { revalidateTag } from "next/cache"

export const createAiTriggerAction = authActionClient
  .schema(createAiTriggerSchema)
  .bindArgsSchemas(createAiTriggerBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, name, description],
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
          description: parsedInput.name,
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
          ...parsedInput,
          chatbotId,
        },
      })

      revalidateTag(`${ctx.user.id}#aiTrigger`)

      return {
        successful: true,
      }
    },
  )
