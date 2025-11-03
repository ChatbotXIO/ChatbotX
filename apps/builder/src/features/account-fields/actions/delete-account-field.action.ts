"use server"

import { FieldType, prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteAccountFieldsAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await prisma.field.deleteMany({
        where: {
          id: {
            in: parsedInput.ids,
          },
          chatbotId,
          fieldType: FieldType.accountField,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#accountFields`)
      for (const id of parsedInput.ids) {
        revalidateTag(`chatbots:${chatbotId}#accountFields:${id}`)
      }
    },
  )
