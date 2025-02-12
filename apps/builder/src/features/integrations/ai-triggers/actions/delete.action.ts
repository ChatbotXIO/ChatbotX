"use server"

import {
  type DeleteAITriggerBindSchema,
  deleteAITriggerBindSchema,
} from "@/features/integrations/ai-triggers/schemas/delete.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const deleteAITriggerAction = authActionClient
  .bindArgsSchemas(deleteAITriggerBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, ids],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DeleteAITriggerBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      await prisma.aITrigger.deleteMany({
        where: {
          id: {
            in: ids,
          },
          chatbotId,
        },
      })

      revalidateTag(`${ctx.user.id}#aiTriggers`)

      return {
        successful: true,
      }
    },
  )
