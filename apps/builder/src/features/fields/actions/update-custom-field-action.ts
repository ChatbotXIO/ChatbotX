"use server"

import {
  chatbotIdAndIdRequestParams,
  type ChatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
import { chatbotActionClient } from "@/lib/safe-action"
import { FieldType, FolderType, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type UpdateCustomFieldSchema,
  updateCustomFieldSchema,
} from "../schemas/update-custom-field-schema"

export const updateCustomFieldAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .schema(updateCustomFieldSchema)
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
          fieldType: FieldType.ACCOUNT_FIELD,
        },
      })

      if (
        parsedInput.folderId &&
        parsedInput.folderId !== customField.folderId
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

      revalidateTag(`chatbots:${chatbotId}#customFields`)
    },
  )
