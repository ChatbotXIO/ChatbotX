"use server"

import { type Prisma, prisma } from "@aha.chat/database"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { FlowException } from "../schemas/exception"

export const duplicateFlowAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const flow = await prisma.flow.findFirstOrThrow({
        where: {
          id,
          chatbotId,
        },
      })

      const draftVersion = await prisma.flowVersion.findFirst({
        where: {
          flowId: flow.id,
          isDraft: true,
        },
      })
      if (!draftVersion) {
        throw new FlowException("Draft version not found")
      }

      await prisma.$transaction(async (tx) => {
        await tx.flow.create({
          data: {
            ...flow,
            id: createId(),
            name: `${flow.name} _copy`,
            chatbotId,
            createdAt: new Date(),
            updatedAt: new Date(),
            flowVersions: {
              create: [
                {
                  chatbotId,
                  nodes: draftVersion.nodes as Prisma.InputJsonValue,
                  edges: draftVersion.edges as Prisma.InputJsonValue,
                  isDraft: true,
                  startNodeId: draftVersion.startNodeId,
                },
              ],
            },
          },
        })
      })

      revalidateCacheTags(`chatbots:${flow.chatbotId}#flows`)
    },
  )
