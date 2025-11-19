"use server"

import { FieldType, prisma } from "@aha.chat/database"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
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

      revalidateCacheTags([
        `chatbots:${chatbotId}#accountFields`,
        ...parsedInput.ids.map(
          (id) => `chatbots:${chatbotId}#accountFields:${id}`,
        ),
      ])
    },
  )
