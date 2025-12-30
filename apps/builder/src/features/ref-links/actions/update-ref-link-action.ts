"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateOrUpdateRefLinkRequest,
  createOrUpdateRefLinkRequest,
} from "../schemas/create-or-update-ref-links-schema"

export const updateRefLinkAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(createOrUpdateRefLinkRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: CreateOrUpdateRefLinkRequest
    }) => {
      await prisma.refLink.update({
        where: {
          id,
          chatbotId,
        },
        data: parsedInput,
      })
    },
  )
