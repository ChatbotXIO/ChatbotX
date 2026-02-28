"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { logModel } from "@aha.chat/database/schema"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type DeleteLogsRequest,
  deleteLogsRequest,
} from "../schemas/delete-log-schema"

export const deleteLogAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(deleteLogsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: DeleteLogsRequest
    }) => {
      await db
        .delete(logModel)
        .where(
          and(
            eq(logModel.chatbotId, chatbotId),
            eq(logModel.logType, parsedInput.logType),
            inArray(logModel.id, parsedInput.ids),
          ),
        )

      revalidateCacheTags(`chatbots:${chatbotId}#logs#${parsedInput.logType}`)
    },
  )
