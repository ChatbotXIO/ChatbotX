"use server"

import { AiAgentException } from "@/features/integrations/ai-agents/schemas/errors.schema"
import {
  type UpdateAiAgentBindSchema,
  type UpdateAiAgentSchema,
  updateAiAgentBindSchema,
  updateAiAgentSchema,
} from "@/features/integrations/ai-agents/schemas/update.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const updateAiAgentAction = authActionClient
  .schema(updateAiAgentSchema)
  .bindArgsSchemas(updateAiAgentBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, agentId],
    }: {
      ctx: { user: User }
      parsedInput: UpdateAiAgentSchema
      bindArgsParsedInputs: UpdateAiAgentBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAiAgent = await prisma.aiAgent.findFirst({
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

      if (existingAiAgent) {
        throw new AiAgentException(
          `AiAgent with the name "${parsedInput.name}" already exists.`,
        )
      }

      await prisma.aiAgent.update({
        where: {
          id: agentId,
        },
        data: {
          name: parsedInput.name,
        },
      })

      revalidateTag(`${ctx.user.id}#aiAgents`)

      return {
        successful: true,
      }
    },
  )
