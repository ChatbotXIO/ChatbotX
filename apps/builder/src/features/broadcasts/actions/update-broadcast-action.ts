"use server"

import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type UpdateBroadcastSchema,
  updateBroadcastSchema,
} from "../schemas/update-broadcast-schema"

export const updateBroadcastAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .schema(updateBroadcastSchema)
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

      revalidateTag(`chatbot:${chatbotId}#broadcasts`)
    },
  )
