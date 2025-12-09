"use server"

import { FieldType, FolderType, Prisma, prisma } from "@aha.chat/database"
import { returnValidationErrors } from "next-safe-action"
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

      try {
        await prisma.field.create({
          data: {
            chatbotId,
            fieldType: FieldType.customField,
            showInInbox: true,
            ...parsedInput,
          },
        })

        revalidateCacheTags(`chatbots:${chatbotId}#customFields`)
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return returnValidationErrors(createCustomFieldSchema, {
            _errors: ["Validation Exception"],
            name: { _errors: ["Name is already taken"] },
          })
        }
        throw new Error("Failed to create custom field")
      }
    },
  )
