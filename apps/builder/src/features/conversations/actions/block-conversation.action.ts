import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const blockConversationAction = chatbotActionClient
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
      await prisma.conversation.updateMany({
        where: {
          id: {
            in: parsedInput.ids,
          },
          chatbotId,
        },
        data: {
          blockedAt: new Date(),
        },
      })

      revalidateTag(`chatbots:${chatbotId}#conversations`)
      for (const id of parsedInput.ids) {
        revalidateTag(`chatbots:${chatbotId}#conversations:${id}`)
      }
    },
  )
