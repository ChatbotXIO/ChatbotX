"use server"

import { FieldType, FolderType, prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateAccountFieldRequest,
  updateAccountFieldRequest,
} from "../schemas/update-account-field.schema"

export const updateAccountFieldAction = chatbotActionClient
  .inputSchema(updateAccountFieldRequest)
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      parsedInput: UpdateAccountFieldRequest
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const accountField = await prisma.field.findFirstOrThrow({
        where: {
          id,
          chatbotId,
          fieldType: FieldType.ACCOUNT_FIELD,
        },
      })

      if (
        parsedInput.folderId &&
        parsedInput.folderId !== accountField.folderId
      ) {
        await ensureFolderIdIsExists(
          parsedInput.folderId,
          chatbotId,
          FolderType.CUSTOM_FIELD,
        )
      }

      await prisma.field.update({
        where: {
          id,
        },
        data: parsedInput,
      })

      revalidateTag(`chatbots:${chatbotId}#accountFields`)
      revalidateTag(`chatbots:${chatbotId}#accountFields:${id}`)
    },
  )
