"use server"

import { FieldType, FolderType, prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateAccountFieldRequest,
  createAccountFieldRequest,
} from "../schemas/create-account-field.schema"

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
        await ensureFolderIdIsExists(
          parsedInput.folderId,
          chatbotId,
          FolderType.customField,
        )
      }

      await prisma.field.create({
        data: {
          chatbotId,
          fieldType: FieldType.accountField,
          showInInbox: false,
          ...parsedInput,
        },
      })

      revalidateCacheTags(`chatbots:${chatbotId}#accountFields`)
    },
  )
