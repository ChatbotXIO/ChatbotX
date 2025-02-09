"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type DeleteFlowBindSchema,
  deleteFlowBindSchema,
} from "../schemas/delete-flow-schema"

export const permanentDeleteFlowAction = authActionClient
  .bindArgsSchemas(deleteFlowBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, ids],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DeleteFlowBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      await prisma.flow.deleteMany({
        where: {
          id: {
            in: ids,
          },
          chatbotId,
        },
      })

      revalidateTag(`${chatbotId}#flows`)

      return {
        successful: true,
      }
    },
  )
