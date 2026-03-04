"use server"

import { db } from "@aha.chat/database/client"
import { fieldModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateAccountFieldRequest,
  createAccountFieldRequest,
} from "../schemas/action"

export const createAccountFieldAction = chatbotActionClient
  .inputSchema(createAccountFieldRequest)
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: CreateAccountFieldRequest
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      if (parsedInput.folderId) {
        await ensureFolderIsExists(
          parsedInput.folderId,
          chatbotId,
          "customField",
        )
      }

      await db.insert(fieldModel).values({
        ...parsedInput,
        id: createId(),
        chatbotId,
        fieldType: "accountField",
        showInInbox: false,
      })

      revalidateCacheTags(`chatbots:${chatbotId}#accountFields`)
    },
  )
