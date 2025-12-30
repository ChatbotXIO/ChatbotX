"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateOrUpdateRefLinkRequest,
  createOrUpdateRefLinkRequest,
} from "../schemas/create-or-update-ref-links-schema"

export const createRefLinkAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createOrUpdateRefLinkRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateOrUpdateRefLinkRequest
    }) => {
      await prisma.refLink.create({
        data: {
          chatbotId,
          ...parsedInput,
        },
      })
    },
  )
