"use server"

import {
  chatbotIdAndIdRequestParams,
  type ChatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { FieldType, FolderType, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  updateAccountFieldRequest,
  type UpdateAccountFieldRequest,
} from "../schemas/update-account-field.schema"
import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"

export const updateAccountFieldAction = chatbotActionClient
  .schema(updateAccountFieldRequest)
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
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
