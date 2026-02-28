"use server"

import { and, db, eq } from "@aha.chat/database/client"
import { conversationModel } from "@aha.chat/database/schema"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const unfollowConversationAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      await db
        .update(conversationModel)
        .set({
          followed: false,
        })
        .where(
          and(
            eq(conversationModel.id, id),
            eq(conversationModel.chatbotId, chatbotId),
          ),
        )

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
      ])
    },
  )
