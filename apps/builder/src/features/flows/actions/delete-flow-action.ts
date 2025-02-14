"use server"

import { ensureUserCanAccessChatbot } from "@/features/chatbot-members/queries"
import {
  type DeleteRecordsSchema,
  deleteRecordsSchema,
} from "@/lib/common-types"
import { authActionClient } from "@/lib/safe-action"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const deleteFlowAction = authActionClient
  .schema(deleteRecordsSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: User }
      parsedInput: DeleteRecordsSchema
    }) => {
      await ensureUserCanAccessChatbot(ctx.user.id, parsedInput.chatbotId)

      await prisma.flow.deleteMany({
        where: {
          id: {
            in: parsedInput.ids,
          },
          chatbotId: parsedInput.chatbotId,
        },
      })

      revalidateTag(`chatbots#${parsedInput.chatbotId}#flows`)
    },
  )
