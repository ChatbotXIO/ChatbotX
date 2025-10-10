"use server"

import { FieldType, FolderType, prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
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
          FolderType.CUSTOM_FIELD,
        )
      }

      await prisma.field.create({
        data: {
          chatbotId,
          fieldType: FieldType.ACCOUNT_FIELD,
          showInInbox: false,
          ...parsedInput,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#accountFields`)
    },
  )
