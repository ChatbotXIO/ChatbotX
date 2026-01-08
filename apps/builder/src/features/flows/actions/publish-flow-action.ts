"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { publishFlowSchema } from "../schemas/action"
import { FlowException } from "../schemas/exception"

export const publishFlowAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const flow = await prisma.flow.findFirst({
        where: {
          id,
          chatbotId,
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
        // Remove all other latest versions
        await tx.flowVersion.updateMany({
          where: {
            flowId: flow.id,
            isLatest: true,
          },
          data: {
            isLatest: false,
          },
        })

        const newVersion = await prisma.flowVersion.create({
          data: {
            chatbotId: flow.chatbotId,
            flowId: flow.id,
            isDraft: false,
            isLatest: true,
            ...validated,
            startNodeId: draftVersion.startNodeId,
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

      revalidateCacheTags([
        `chatbots:${chatbotId}#flows`,
        `chatbots:${chatbotId}#flows:${id}`,
      ])
    },
  )
