"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type PublishFlowSchema,
  type UpdateFlowBindSchema,
  publishFlowSchema,
  updateFlowBindSchema,
} from "../schemas/update-flow-schema"

export const publishFlowAction = authActionClient
  .schema(publishFlowSchema)
  .bindArgsSchemas(updateFlowBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, flowId],
    }: {
      ctx: { user: User }
      parsedInput: PublishFlowSchema
      bindArgsParsedInputs: UpdateFlowBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)
      let currentDraftVersion = await prisma.flowVersion.findFirst({
        where: {
          chatbotId,
          flowId: flowId,
          isDraft: true,
        },
      })
      await prisma.$transaction(async (prisma) => {
        if (currentDraftVersion) {
          await prisma.flowVersion.update({
            where: {
              id: currentDraftVersion.id,
            },
            data: {
              nodes: parsedInput.nodes,
              edges: parsedInput.edges,
              isDraft: false,
            },
          })
        } else {
          currentDraftVersion = await prisma.flowVersion.create({
            data: {
              chatbotId,
              flowId,
              isDraft: false,
              nodes: parsedInput.nodes,
              edges: parsedInput.edges,
            },
          })
        }
        prisma.flow.update({
          where: {
            id: flowId,
          },
          data: {
            currentVersionId: currentDraftVersion.id,
          },
        })
      })

      revalidateTag(`${chatbotId}#flows`)

      return {
        successful: true,
      }
    },
  )
