"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { broadcastModel } from "@chatbotx.io/database/schema"
import type { BroadcastModel } from "@chatbotx.io/database/types"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateBroadcastSchema,
  updateBroadcastSchema,
} from "../schemas/action"

export const updateBroadcastAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateBroadcastSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateBroadcastSchema
    }) => {
      const broadcast = await findOrFail<BroadcastModel>(broadcastModel, {
        id,
        chatbotId,
      })

      await db
        .update(broadcastModel)
        .set(parsedInput)
        .where(eq(broadcastModel.id, broadcast.id))

      revalidateCacheTags(`chatbots:${chatbotId}#broadcasts`)
    },
  )
