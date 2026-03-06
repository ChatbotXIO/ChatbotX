"use server"

import { db, isDatabaseError } from "@aha.chat/database/client"
import { fieldModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateCustomFieldSchema,
  createCustomFieldSchema,
} from "../schemas/action"

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
        await ensureFolderIsExists(
          parsedInput.folderId,
          chatbotId,
          "customField",
        )
      }

      try {
        await db.insert(fieldModel).values({
          id: createId(),
          chatbotId,
          fieldType: "customField",
          showInInbox: true,
          ...parsedInput,
        })

        revalidateCacheTags(`chatbots:${chatbotId}#customFields`)
      } catch (error) {
        if (isDatabaseError(error) && error.cause.code === "23505") {
          return returnValidationErrors(createCustomFieldSchema, {
            _errors: ["Validation Exception"],
            name: { _errors: ["Name is already taken"] },
          })
        }

        throw new Error("Failed to create custom field")
      }
    },
  )
