"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import { type DeleteAiTriggerBindSchema, deleteAiTriggerBindSchema } from "@/features/integrations/ai-triggers/schemas/delete.schema";

export const deleteAiTriggerAction = authActionClient
  .bindArgsSchemas(deleteAiTriggerBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, ids],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DeleteAiTriggerBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      await prisma.aiTrigger.deleteMany({
        where: {
          id: {
            in: ids,
          },
          chatbotId,
        },
      })

      revalidateTag(`${ctx.user.id}#aiTrigger`)

      return {
        successful: true,
      }
    },
  )
