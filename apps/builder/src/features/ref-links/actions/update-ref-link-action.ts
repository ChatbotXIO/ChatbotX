"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateOrUpdateReflinkRequest,
  createOrUpdateReflinkRequest,
} from "../schemas/create-or-update-ref-links-schema"

export const updateReflinkAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(createOrUpdateReflinkRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: CreateOrUpdateReflinkRequest
    }) => {
      await prisma.reflink.update({
        where: {
          id,
          chatbotId,
        },
        data: parsedInput,
      })
    },
  )
