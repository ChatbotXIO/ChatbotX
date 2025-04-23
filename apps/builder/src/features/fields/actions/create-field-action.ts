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
  type CreateCustomFieldSchema,
  createCustomFieldSchema,
} from "../schemas/create-field-schema"

export const createCustomFieldAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .schema(createCustomFieldSchema)
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
          FolderType.CUSTOM_FIELD,
        )
      }

      await prisma.field.create({
        data: {
          chatbotId,
          fieldType: FieldType.CUSTOM_FIELD,
          showInInbox: true,
          ...parsedInput,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#customFields`)
    },
  )
