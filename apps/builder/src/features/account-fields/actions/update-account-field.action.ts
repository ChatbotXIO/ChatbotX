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
  type UpdateAccountFieldRequest,
  updateAccountFieldRequest,
} from "../schemas/action"

export const updateAccountFieldAction = chatbotActionClient
  .inputSchema(updateAccountFieldRequest)
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      parsedInput: UpdateAccountFieldRequest
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const accountField = await findOrFail<FieldModel>(
        fieldModel,
        {
          id,
          chatbotId,
          fieldType: "accountField",
        },
        "Account field not found",
      )

      if (
        parsedInput.folderId &&
        parsedInput.folderId !== accountField.folderId
      ) {
        await ensureFolderIsExists(
          parsedInput.folderId,
          chatbotId,
          "customField",
        )
      }

      await db.update(fieldModel).set(parsedInput).where(eq(fieldModel.id, id))

      revalidateCacheTags([
        `chatbots:${chatbotId}#accountFields`,
        `chatbots:${chatbotId}#accountFields:${id}`,
      ])
    },
  )
