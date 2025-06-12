"use server"

import {
  chatbotIdRequestParams,
  type ChatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
import { chatbotActionClient } from "@/lib/safe-action"
import { FieldType, FolderType, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  createAccountFieldRequest,
  type CreateAccountFieldRequest,
} from "../schemas/create-account-field.schema"

export const createAccountFieldAction = chatbotActionClient
  .schema(createAccountFieldRequest)
  .bindArgsSchemas(chatbotIdRequestParams.items)
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
