"use server"

import { db } from "@aha.chat/database/client"
import { botFieldModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateBotFieldRequest,
  createBotFieldRequest,
} from "../schemas/action"

export const createBotFieldAction = chatbotActionClient
  .inputSchema(createBotFieldRequest)
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: CreateBotFieldRequest
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      if (parsedInput.folderId) {
        await ensureFolderIsExists(
          parsedInput.folderId,
          chatbotId,
          "customField",
        )
      }

      await db.insert(botFieldModel).values({
        ...parsedInput,
        id: createId(),
        chatbotId,
      })

      revalidateCacheTags(`chatbots:${chatbotId}#botFields`)
    },
  )
