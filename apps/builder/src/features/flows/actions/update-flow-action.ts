"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateFlowSchema,
  updateFlowSchema,
} from "../schemas/update-flow-schema"

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
      const flow = await prisma.flow.findFirstOrThrow({
        where: {
          id,
          chatbotId,
        },
      })

      await prisma.flow.update({
        where: {
          id: flow.id,
        },
        data: parsedInput,
      })

      revalidateCacheTags(`chatbots:${flow.chatbotId}#flows`)
    },
  )
