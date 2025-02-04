"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type DeleteAiAgentBindSchema,
  deleteAiAgentBindSchema,
} from "@/features/integrations/ai-agents/schemas/delete.schema"

export const deleteAiAgentAction = authActionClient
  .bindArgsSchemas(deleteAiAgentBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, ids],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DeleteAiAgentBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      await prisma.aiAgent.deleteMany({
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
