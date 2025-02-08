"use server"
import {
  type DeleteAiAssistantsBindSchema,
  deleteAiAssistantsBindSchema,
} from "@/features/integrations/ai-assistants/schemas/delete.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const deleteAiAssistantsAction = authActionClient
  .bindArgsSchemas(deleteAiAssistantsBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, ids],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DeleteAiAssistantsBindSchema
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
