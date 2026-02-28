import { and, db, eq, inArray } from "@aha.chat/database/client"
import { conversationModel } from "@aha.chat/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const disableLiveChatConversationAction = chatbotActionClient
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
      await db
        .update(conversationModel)
        .set({
          liveChatEnabled: false,
        })
        .where(
          and(
            eq(conversationModel.chatbotId, chatbotId),
            inArray(conversationModel.id, parsedInput.ids),
          ),
        )

      revalidateCacheTags([
        `chatbots:${chatbotId}#conversations`,
        ...parsedInput.ids.map(
          (id) => `chatbots:${chatbotId}#conversations:${id}`,
        ),
      ])
    },
  )
