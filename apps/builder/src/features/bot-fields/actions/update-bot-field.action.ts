"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { botFieldModel } from "@aha.chat/database/schema"
import type { FieldModel } from "@aha.chat/database/types"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateBotFieldRequest,
  updateBotFieldRequest,
} from "../schemas/action"

export const updateBotField = async ({
  chatbotId,
  id,
  parsedInput,
}: {
  chatbotId: string
  id: string
  parsedInput: UpdateBotFieldRequest
}) => {
  const botField = await findOrFail<FieldModel>(
    botFieldModel,
    {
      id,
      chatbotId,
    },
    "Account field not found",
  )

  if (parsedInput.folderId && parsedInput.folderId !== botField.folderId) {
    await ensureFolderIsExists(parsedInput.folderId, chatbotId, "customField")
  }

  const updatedBotField = await db
    .update(botFieldModel)
    .set(parsedInput)
    .where(eq(botFieldModel.id, id))
    .returning()
    .then((result) => result[0])

  revalidateCacheTags([
    `chatbots:${chatbotId}#botFields`,
    `chatbots:${chatbotId}#botFields:${id}`,
  ])

  return updatedBotField
}

export const updateBotFieldAction = chatbotActionClient
  .inputSchema(updateBotFieldRequest)
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      parsedInput: UpdateBotFieldRequest
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      return await updateBotField({ chatbotId, id, parsedInput })
    },
  )
