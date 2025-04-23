"use server"

import {
  bulkUpdateIdsRequest,
  chatbotIdRequestParams,
  type BulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { FieldType, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const deleteAccountFieldsAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .schema(bulkUpdateIdsRequest)
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
          fieldType: FieldType.ACCOUNT_FIELD,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#accountFields`)
      for (const id of parsedInput.ids) {
        revalidateTag(`chatbots:${chatbotId}#accountFields:${id}`)
      }
    },
  )
