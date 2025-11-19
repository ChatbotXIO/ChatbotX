"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateBroadcastSchema,
  updateBroadcastSchema,
} from "../schemas/update-broadcast-schema"

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
      const broadcast = await prisma.broadcast.findFirstOrThrow({
        where: {
          id,
          chatbotId,
        },
      })

      await prisma.broadcast.update({
        where: {
          id: broadcast.id,
        },
        data: parsedInput,
      })

      revalidateCacheTags(`chatbots:${chatbotId}#broadcasts`)
    },
  )
