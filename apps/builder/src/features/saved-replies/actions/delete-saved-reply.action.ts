"use server"

import { and, db, eq } from "@aha.chat/database/client"
import { savedReplyModel } from "@aha.chat/database/schema"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"

export const deleteSavedReplyAction = authActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [_chatbotId, id],
      ctx,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      ctx: { user: { id: string } }
    }) => {
      await db
        .delete(savedReplyModel)
        .where(
          and(
            eq(savedReplyModel.userId, ctx.user.id),
            eq(savedReplyModel.id, id),
          ),
        )

      revalidateCacheTags(`users:${ctx.user.id}#savedReplies`)
    },
  )
