"use server"

import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { FlowException } from "../schemas/exception"
import { publishFlowSchema } from "../schemas/update-flow-schema"

export const publishFlowAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
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
        const newVersion = await prisma.flowVersion.create({
          data: {
            chatbotId: flow.chatbotId,
            flowId: flow.id,
            isDraft: false,
            ...validated,
            startNodeId: "",
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

      revalidateTag(`chatbots:${chatbotId}#flows`)
      revalidateTag(`chatbots:${chatbotId}#flows:${id}`)
    },
  )
