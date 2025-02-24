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

      const aiAgent = await prisma.aIAgent.findFirst({
        where: {
          id,
          chatbotId,
        },
      })
      if (!aiAgent) {
        return {
          successful: true,
        }
      }

      await prisma.aIAgent.create({
        data: {
          name: `${aiAgent.name}  _copy`,
          prompt: aiAgent.prompt,
          messages: aiAgent.messages as JsonObject[],
          chatbotId: aiAgent.chatbotId,
        },
      })

      revalidateTag(`${ctx.user.id}#aiAgents`)

      return {
        successful: true,
      }
    },
  )
