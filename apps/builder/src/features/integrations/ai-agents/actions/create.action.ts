"use server"

import { authActionClient } from "@/lib/safe-action"
import {
  type CreateAiAgentBindSchema,
  type CreateAiAgentSchema,
  createAiAgentBindSchema,
  createAiAgentSchema,
} from "@/features/integrations/ai-agents/schemas/create.schema"
import { prisma, User } from "@ahachat.ai/database"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { AiAgentException } from "@/features/integrations/ai-agents/schemas/errors.schema"
import { revalidateTag } from "next/cache"

export const createAiAgentAction = authActionClient
  .schema(createAiAgentSchema)
  .bindArgsSchemas(createAiAgentBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, name],
    }: {
      ctx: { user: User }
      parsedInput: CreateAiAgentSchema
      bindArgsParsedInputs: CreateAiAgentBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAiAgent = await prisma.aiAgent.findFirst({
        select: {
          id: true,
        },
        where: {
          name: parsedInput.name,
          chatbotId,
        },
      })

      if (existingAiAgent) {
        throw new AiAgentException(
          `AiAgent with the name "${parsedInput.name}" already exists.`,
        )
      }

      await prisma.aiAgent.create({
        data: {
          ...parsedInput,
          chatbotId,
        },
      })

      revalidateTag(`${ctx.user.id}#aiAgents`)

      return {
        successful: true,
      }
    },
  )
