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
  type UpdateCustomFieldSchema,
  updateCustomFieldSchema,
} from "../schemas/update-custom-field.schema"

export const updateCustomFieldAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateCustomFieldSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateCustomFieldSchema
    }) => {
      const customField = await prisma.field.findFirstOrThrow({
        where: {
          id,
          chatbotId,
          fieldType: FieldType.accountField,
        },
      })

      if (
        parsedInput.folderId &&
        parsedInput.folderId !== customField.folderId
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

      revalidateCacheTags(`chatbots:${chatbotId}#customFields`)
    },
  )
