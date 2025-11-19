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
  type CreateCustomFieldSchema,
  createCustomFieldSchema,
} from "../schemas/create-custom-field.schema"

export const createCustomFieldAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createCustomFieldSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateCustomFieldSchema
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
          fieldType: FieldType.customField,
          showInInbox: true,
          ...parsedInput,
        },
      })

      revalidateCacheTags(`chatbots:${chatbotId}#customFields`)
    },
  )
