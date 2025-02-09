"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type DraftFlowSchema,
  type UpdateFlowBindSchema,
  draftFlowSchema,
  updateFlowBindSchema,
} from "../schemas/update-flow-schema"

export const draftFlowAction = authActionClient
  .schema(draftFlowSchema)
  .bindArgsSchemas(updateFlowBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, flowId],
    }: {
      ctx: { user: User }
      parsedInput: DraftFlowSchema
      bindArgsParsedInputs: UpdateFlowBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)
      const currentDraftVersion = await prisma.flowVersion.findFirst({
        where: {
          chatbotId,
          flowId: flowId,
          isDraft: true,
        },
      })
      if (currentDraftVersion) {
        await prisma.flowVersion.update({
          where: { id: currentDraftVersion.id },
          data: {
            nodes: parsedInput.nodes,
            edges: parsedInput.edges,
          },
        })
      } else {
        await prisma.flowVersion.create({
          data: {
            chatbotId,
            flowId,
            isDraft: true,
            nodes: parsedInput.nodes,
            edges: parsedInput.edges,
          },
        })
      }

      revalidateTag(`${ctx.user.id}#flows`)
      revalidateTag(`${ctx.user.id}#flows#${flowId}`)

      return {
        successful: true,
      }
    },
  )
