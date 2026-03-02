"use server"

import { and, db, eq } from "@aha.chat/database/client"
import { flowModel, flowVersionModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
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
      const flow = await db.query.flowModel.findFirst({
        where: {
          id,
          chatbotId,
        },
        with: {
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

      await db.transaction(async (tx) => {
        // Remove all other latest versions
        await tx
          .update(flowVersionModel)
          .set({
            isLatest: false,
          })
          .where(
            and(
              eq(flowVersionModel.flowId, flow.id),
              eq(flowVersionModel.isLatest, true),
            ),
          )

        const newVersionId = createId()
        await tx.insert(flowVersionModel).values({
          id: newVersionId,
          chatbotId: flow.chatbotId,
          flowId: flow.id,
          isDraft: false,
          isLatest: true,
          ...validated,
          startNodeId: draftVersion.startNodeId,
        })

        await tx
          .update(flowModel)
          .set({
            currentVersionId: newVersionId,
          })
          .where(eq(flowModel.id, flow.id))
      })

      revalidateCacheTags([
        `chatbots:${chatbotId}#flows`,
        `chatbots:${chatbotId}#flows:${id}`,
      ])
    },
  )
