"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { fieldModel } from "@aha.chat/database/schema"
import type { FieldModel } from "@aha.chat/database/types"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateCustomFieldRequest,
  updateCustomFieldRequest,
} from "../schemas/action"

export const updateCustomFieldAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateCustomFieldRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateCustomFieldRequest
    }) => {
      await updateCustomField({ chatbotId, id, parsedInput })
    },
  )

export const updateCustomField = async ({
  chatbotId,
  id,
  parsedInput,
}: {
  chatbotId: string
  id: string
  parsedInput: UpdateCustomFieldRequest
}) => {
  const customField = await findOrFail<FieldModel>(
    fieldModel,
    {
      id,
      chatbotId,
      fieldType: "customField",
    },
    "Custom field not found",
  )

  if (parsedInput.folderId && parsedInput.folderId !== customField.folderId) {
    await ensureFolderIsExists(parsedInput.folderId, chatbotId, "customField")
  }

  await db.update(fieldModel).set(parsedInput).where(eq(fieldModel.id, id))

  revalidateCacheTags(`chatbots:${chatbotId}#customFields`)
}
