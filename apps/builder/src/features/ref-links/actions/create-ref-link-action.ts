"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateOrUpdateReflinkRequest,
  createOrUpdateReflinkRequest,
} from "../schemas/create-or-update-ref-links-schema"

export const createReflinkAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createOrUpdateReflinkRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateOrUpdateReflinkRequest
    }) => {
      await prisma.reflink.create({
        data: {
          chatbotId,
          ...parsedInput,
        },
      })
    },
  )
