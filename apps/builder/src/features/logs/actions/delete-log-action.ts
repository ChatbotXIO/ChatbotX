"use server"

import {
  chatbotIdRequestParams,
  type ChatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  deleteLogsRequest,
  type DeleteLogsRequest,
} from "../schemas/delete-log-schema"

export const deleteLogAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(deleteLogsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: DeleteLogsRequest
    }) => {
      await prisma.log.deleteMany({
        where: {
          id: {
            in: parsedInput.ids,
          },
          chatbotId,
          logType: parsedInput.logType,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#logs#${parsedInput.logType}`)

      return {
        successful: true,
      }
    },
  )
