"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { flowModel } from "@chatbotx.io/database/schema"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { type UpdateFlowSchema, updateFlowSchema } from "../schemas/action"

export const updateFlowAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateFlowSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateFlowSchema
    }) => {
      const flow = await findOrFail(
        flowModel,
        {
          id,
          chatbotId,
        },
        "Flow not found",
      )

      await db
        .update(flowModel)
        .set(parsedInput)
        .where(eq(flowModel.id, flow.id))

      revalidateCacheTags(`chatbots:${flow.chatbotId}#flows`)
    },
  )
