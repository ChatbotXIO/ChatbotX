"use server"

import { getAllChatbotMembers } from "@/features/chatbot-members/queries"
import { type IdBindParams, idBindParams } from "@/lib/common-types"
import { authActionClient } from "@/lib/safe-action"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type UpdateFlowSchema,
  updateFlowSchema,
} from "../schemas/update-flow-schema"

export const updateFlowAction = authActionClient
  .schema(updateFlowSchema)
  .bindArgsSchemas(idBindParams.items)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [id],
    }: {
      ctx: { user: User }
      parsedInput: UpdateFlowSchema
      bindArgsParsedInputs: IdBindParams
    }) => {
      const { chatbotIds } = await getAllChatbotMembers(ctx.user.id)
      const flow = await prisma.flow.findFirstOrThrow({
        where: {
          id,
          chatbotId: {
            in: chatbotIds,
          },
        },
      })

      await prisma.flow.update({
        where: {
          id: flow.id,
        },
        data: parsedInput,
      })

      revalidateTag(`chatbots#${flow.chatbotId}#flows`)
    },
  )
