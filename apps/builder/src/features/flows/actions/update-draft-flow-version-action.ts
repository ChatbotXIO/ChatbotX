"use server"

import { getAllChatbotMembers } from "@/features/chatbot-members/queries"
import { type IdBindParams, idBindParams } from "@/lib/common-types"
import { authActionClient } from "@/lib/safe-action"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type UpdateDraftFlowVersionSchema,
  updateDraftFlowVersionSchema,
} from "../schemas/update-flow-schema"

export const updateDraftFlowVersionAction = authActionClient
  .schema(updateDraftFlowVersionSchema)
  .bindArgsSchemas(idBindParams.items)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [id],
    }: {
      ctx: { user: User }
      parsedInput: UpdateDraftFlowVersionSchema
      bindArgsParsedInputs: IdBindParams
    }) => {
      const { chatbotIds } = await getAllChatbotMembers(ctx.user.id)
      const flowVersion = await prisma.flowVersion.findFirstOrThrow({
        where: {
          id,
          chatbotId: {
            in: chatbotIds,
          },
          isDraft: true,
        },
      })

      await prisma.flowVersion.update({
        where: { id: flowVersion.id },
        data: {
          nodes: parsedInput.nodes,
          edges: parsedInput.edges,
        },
      })

      revalidateTag(
        `chatbots#${flowVersion.chatbotId}#flows#${flowVersion.flowId}`,
      )
    },
  )
