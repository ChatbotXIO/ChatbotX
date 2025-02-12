"use server"

import { AIAgentException } from "@/features/integrations/ai-agents/schemas/errors.schema"
import {
  type UpdateAIAgentBindSchema,
  type UpdateAIAgentSchema,
  updateAIAgentBindSchema,
  updateAIAgentSchema,
} from "@/features/integrations/ai-agents/schemas/update.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const updateAIAgentAction = authActionClient
  .schema(updateAIAgentSchema)
  .bindArgsSchemas(updateAIAgentBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, agentId],
    }: {
      ctx: { user: User }
      parsedInput: UpdateAIAgentSchema
      bindArgsParsedInputs: UpdateAIAgentBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAIAgent = await prisma.aIAgent.findFirst({
        select: {
          id: true,
        },
        where: {
          name: parsedInput.name,
          chatbotId,
          id: {
            not: agentId,
          },
        },
      })

      if (existingAIAgent) {
        throw new AIAgentException(
          `AIAgent with the name "${parsedInput.name}" already exists.`,
        )
      }

      await prisma.aIAgent.update({
        where: {
          id: agentId,
        },
        data: parsedInput,
      })

      revalidateTag(`${ctx.user.id}#aIAgents`)

      return {
        successful: true,
      }
    },
  )
