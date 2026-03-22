"use server"

import { db, isDatabaseError } from "@aha.chat/database/client"
import { customFieldModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateCustomFieldRequest,
  createCustomFieldRequest,
} from "../schemas/action"
import type { CustomFieldResource } from "../schemas/resource"

export const createCustomFieldAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createCustomFieldRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateCustomFieldRequest
    }) => {
      await createCustomField(chatbotId, parsedInput)
    },
  )

export const createCustomField = async (
  chatbotId: string,
  parsedInput: CreateCustomFieldRequest,
): Promise<CustomFieldResource> => {
  if (parsedInput.folderId) {
    await ensureFolderIsExists(parsedInput.folderId, chatbotId, "customField")
  }

  try {
    const newField = await db
      .insert(customFieldModel)
      .values({
        id: createId(),
        chatbotId,
        showInInbox: true,
        ...parsedInput,
      })
      .returning()
      .then((result) => result[0])

    revalidateCacheTags(`chatbots:${chatbotId}#customFields`)

    return newField
  } catch (error) {
    if (isDatabaseError(error) && error.cause.code === "23505") {
      return returnValidationErrors(createCustomFieldRequest, {
        _errors: ["Validation Exception"],
        name: { _errors: ["Name is already taken"] },
      })
    }

    throw new ChatbotXException("Failed to create custom field")
  }
}
