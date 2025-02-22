"use server"

import { getAllChatbotMembers } from "@/features/chatbot-members/queries"
import { type IdBindParams, idBindParams } from "@/lib/common-types"
import { authActionClient } from "@/lib/safe-action"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type UpdateBroadcastSchema,
  updateBroadcastSchema,
} from "../schemas/update-broadcast-schema"

export const updateBroadcastAction = authActionClient
  .schema(updateBroadcastSchema)
  .bindArgsSchemas(idBindParams.items)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [id],
    }: {
      ctx: { user: User }
      parsedInput: UpdateBroadcastSchema
      bindArgsParsedInputs: IdBindParams
    }) => {
      const { chatbotIds } = await getAllChatbotMembers(ctx.user.id)
      const broadcast = await prisma.broadcast.findFirstOrThrow({
        where: {
          id,
          chatbotId: {
            in: chatbotIds,
          },
        },
      })

      await prisma.broadcast.update({
        where: {
          id: broadcast.id,
        },
        data: parsedInput,
      })

      revalidateTag(`${ctx.user.id}#broadcasts`)
    },
  )
