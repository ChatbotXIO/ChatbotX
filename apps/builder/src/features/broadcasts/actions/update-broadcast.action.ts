"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { broadcastModel } from "@aha.chat/database/schema"
import type { BroadcastModel } from "@aha.chat/database/types"
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
