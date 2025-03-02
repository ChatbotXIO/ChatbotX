"use server"

import { getAllChatbotMembers } from "@/features/chatbot-members/queries"
import { type IdBindParams, idBindParams } from "@/lib/common-types"
import { authActionClient } from "@/lib/safe-action"
import { type User, prisma } from "@ahachat.ai/database"
import { FlowException } from "../schemas/exception"
import { publishFlowSchema } from "../schemas/update-flow-schema"

export const publishFlowAction = authActionClient
  .bindArgsSchemas(idBindParams.items)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [id],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: IdBindParams
    }) => {
      const { chatbotIds } = await getAllChatbotMembers(ctx.user.id)
      const flow = await prisma.flow.findFirst({
        where: {
          id,
          chatbotId: {
            in: chatbotIds,
          },
        },
        include: {
          flowVersions: {
            where: {
              isDraft: true,
            },
          },
        },
      })

      if (!flow || flow.flowVersions.length === 0) {
        throw new FlowException("Flow not found")
      }

      const draftVersion = flow.flowVersions[0]
      const validated = publishFlowSchema.parse({
        nodes: draftVersion?.nodes,
        edges: draftVersion?.edges,
      })

      await prisma.$transaction(async (tx) => {
        const newVersion = await prisma.flowVersion.create({
          data: {
            chatbotId: flow.chatbotId,
            flowId: flow.id,
            isDraft: false,
            ...validated,
          },
        })

        await tx.flow.update({
          where: {
            id: flow.id,
          },
          data: {
            currentVersionId: newVersion.id,
          },
        })
      })
    },
  )
