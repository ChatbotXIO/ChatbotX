"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { flowVersionModel } from "@aha.chat/database/schema"
import type { FlowVersionModel } from "@aha.chat/database/types"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateDraftFlowVersionSchema,
  updateDraftFlowVersionSchema,
} from "../schemas/action"

export const updateDraftFlowVersionAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateDraftFlowVersionSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateDraftFlowVersionSchema
    }) => {
      const flowVersion = await findOrFail<FlowVersionModel>(
        flowVersionModel,
        {
          id,
          chatbotId,
          isDraft: true,
        },
        "Draft flow version not found",
      )

      await db
        .update(flowVersionModel)
        .set({
          nodes: parsedInput.nodes,
          edges: parsedInput.edges,
        })
        .where(eq(flowVersionModel.id, flowVersion.id))

      // revalidateCacheTags(`chatbots:${chatbotId}#flows:${id}`)
    },
  )
