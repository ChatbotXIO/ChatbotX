"use server"

import { FieldType, FolderType, prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
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
          fieldType: FieldType.accountField,
        },
      })

      if (
        parsedInput.folderId &&
        parsedInput.folderId !== accountField.folderId
      ) {
        await ensureFolderIdIsExists(
          parsedInput.folderId,
          chatbotId,
          FolderType.customField,
        )
      }

      await prisma.field.update({
        where: {
          id,
        },
        data: parsedInput,
      })

      revalidateCacheTags([
        `chatbots:${chatbotId}#accountFields`,
        `chatbots:${chatbotId}#accountFields:${id}`,
      ])
    },
  )
