"use server"

import {
  type DeleteAIAgentBindSchema,
  deleteAIAgentBindSchema,
} from "@/features/integrations/ai-agents/schemas/delete.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const deleteAIAgentAction = authActionClient
  .bindArgsSchemas(deleteAIAgentBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, ids],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DeleteAIAgentBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      await prisma.aIAgent.deleteMany({
        where: {
          id: {
            in: ids,
          },
          chatbotId,
        },
      })

      revalidateTag(`${ctx.user.id}#aiAgents`)

      return {
        successful: true,
      }
    },
  )
