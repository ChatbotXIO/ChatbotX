"use server"

import {
  type DuplicateAIAgentBindSchema,
  duplicateAIAgentBindSchema,
} from "@/features/integrations/ai-agents/schemas/duplicate.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import type { JsonObject } from "@prisma/client/runtime/binary"
import { revalidateTag } from "next/cache"

export const duplicateAIAgentAction = authActionClient
  .bindArgsSchemas(duplicateAIAgentBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DuplicateAIAgentBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAIAgent = await prisma.aiAgent.findFirst({
        select: {
          name: true,
          prompt: true,
          messages: true,
          chatbotId: true,
        },
        where: {
          id,
          chatbotId,
        },
      })

      const dupAgent = await prisma.aiAgent.create({
        data: {
          name: `${existingAIAgent?.name}_copy_${new Date().getTime()}`,
          chatbotId,
        },
      })

      await prisma.aiAgent.update({
        where: {
          id: dupAgent.id,
        },
        data: {
          prompt: existingAIAgent?.prompt || "",
          messages: existingAIAgent?.messages.length
            ? (existingAIAgent.messages as JsonObject[])
            : [],
        },
      })

      revalidateTag(`${ctx.user.id}#aiAgents`)

      return {
        successful: true,
      }
    },
  )
