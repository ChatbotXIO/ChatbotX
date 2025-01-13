"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type DeleteLogBindSchema,
  deleteLogBindSchema,
} from "../schemas/delete-log-schema"

export const deleteLogAction = authActionClient
  .bindArgsSchemas(deleteLogBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, ids, logType],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DeleteLogBindSchema
    }) => {
      const { chatbot } = await findChatbotOrFail(ctx.user.id, chatbotId)

      await prisma.log.deleteMany({
        where: {
          id: {
            in: ids,
          },
          chatbotId: chatbot.id,
        },
      })

      revalidateTag(`${ctx.user.id}#logs#${logType}`)

      return {
        successful: true,
      }
    },
  )
