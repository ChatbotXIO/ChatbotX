"use server"
import {
  type DeleteAIAssistantsBindSchema,
  deleteAIAssistantsBindSchema,
} from "@/features/integrations/ai-assistants/schemas/delete.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const deleteAIAssistantsAction = authActionClient
  .bindArgsSchemas(deleteAIAssistantsBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, ids],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DeleteAIAssistantsBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      await prisma.aiAssistant.deleteMany({
        where: {
          id: {
            in: ids,
          },
          chatbotId,
        },
      })

      revalidateTag(`${ctx.user.id}#aiAssistants`)

      return {
        successful: true,
      }
    },
  )
