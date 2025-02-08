"use server"

import {
  type DuplicateAiAgentBindSchema,
  duplicateAiAgentBindSchema,
} from "@/features/integrations/ai-agents/schemas/duplicate.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import type { JsonObject } from "@prisma/client/runtime/binary"
import { revalidateTag } from "next/cache"

export const duplicateAiAgentAction = authActionClient
  .bindArgsSchemas(duplicateAiAgentBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DuplicateAiAgentBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAiAgent = await prisma.aiAgent.findFirst({
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
          name: `${existingAiAgent?.name}_copy_${new Date().getTime()}`,
          chatbotId,
        },
      })

      await prisma.aiAgent.update({
        where: {
          id: dupAgent.id,
        },
        data: {
          prompt: existingAiAgent?.prompt || "",
          messages: existingAiAgent?.messages.length
            ? (existingAiAgent.messages as JsonObject[])
            : [],
        },
      })

      revalidateTag(`${ctx.user.id}#aiAgents`)

      return {
        successful: true,
      }
    },
  )
