"use server"

import { db, isDatabaseError } from "@chatbotx.io/database/client"
import { customFieldModel } from "@chatbotx.io/database/schema"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateCustomFieldRequest,
  createCustomFieldRequest,
} from "../schemas/action"
import type { CustomFieldResource } from "../schemas/resource"

export const createCustomFieldAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createCustomFieldRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateCustomFieldRequest
    }) => {
      await createCustomField(workspaceId, parsedInput)
    },
  )

export const createCustomField = async (
  workspaceId: string,
  parsedInput: CreateCustomFieldRequest,
): Promise<CustomFieldResource> => {
  if (parsedInput.folderId) {
    await ensureFolderIsExists(parsedInput.folderId, workspaceId, "customField")
  }

  try {
    const newField = await db
      .insert(customFieldModel)
      .values({
        workspaceId,
        showInInbox: true,
        ...parsedInput,
      })
      .returning()
      .then((result) => result[0])

    revalidateCacheTags(`workspaces:${workspaceId}#customFields`)

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
