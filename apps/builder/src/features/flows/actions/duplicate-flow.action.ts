"use server"

import { db, findOrFail } from "@aha.chat/database/client"
import { flowModel, flowVersionModel } from "@aha.chat/database/schema"
import type { FlowModel, FlowVersionModel } from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const duplicateFlowAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const flow = await findOrFail<FlowModel>(
        flowModel,
        {
          id,
          chatbotId,
        },
        "Flow not found",
      )

      const draftVersion = await findOrFail<FlowVersionModel>(
        flowVersionModel,
        {
          flowId: flow.id,
          isDraft: true,
        },
        "Draft version not found",
      )

      await db.transaction(async (tx) => {
        const newFlowId = createId()
        await tx.insert(flowModel).values({
          ...flow,
          id: newFlowId,
          name: `${flow.name} _copy`,
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        await tx.insert(flowVersionModel).values({
          ...draftVersion,
          id: createId(),
          flowId: newFlowId,
          isDraft: true,
          startNodeId: draftVersion.startNodeId,
        })
      })

      revalidateCacheTags(`chatbots:${flow.chatbotId}#flows`)
    },
  )
