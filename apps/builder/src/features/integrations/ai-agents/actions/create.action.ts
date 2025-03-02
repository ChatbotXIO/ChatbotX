"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import {
  type CreateAIAgentSchema,
  createAIAgentSchema,
} from "@/features/integrations/ai-agents/schemas/create.schema"
import { AIAgentException } from "@/features/integrations/ai-agents/schemas/errors.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const createAIAgentAction = authActionClient
  .schema(createAIAgentSchema)
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: User }
      parsedInput: CreateAIAgentSchema
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAIAgent = await prisma.aIAgent.findFirst({
        select: {
          id: true,
        },
        where: {
          name: parsedInput.name,
          chatbotId,
        },
      })

      if (existingAIAgent) {
        throw new AIAgentException(
          `AIAgent with the name "${parsedInput.name}" already exists.`,
        )
      }

      await prisma.aIAgent.create({
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
