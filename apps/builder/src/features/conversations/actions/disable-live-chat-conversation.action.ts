import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const disableLiveChatConversationAction = chatbotActionClient
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
          liveChatEnabled: false,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#conversations`)
      for (const id of parsedInput.ids) {
        revalidateTag(`chatbots:${chatbotId}#conversations:${id}`)
      }
    },
  )
