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

export const deleteFieldsAction = chatbotActionClient
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
          fieldType: FieldType.CUSTOM_FIELD,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#customFields`)
    },
  )
