"use server"

import { and, db, eq } from "@aha.chat/database/client"
import { savedReplyModel } from "@aha.chat/database/schema"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"
import {
  type DeleteSavedReplyRequest,
  deleteSavedReplyRequest,
} from "../schemas/delete-saved-reply.schema"

export const deleteSavedReplyAction = authActionClient
  .inputSchema(deleteSavedReplyRequest)
  .action(
    async ({
      parsedInput,
      ctx,
    }: {
      parsedInput: DeleteSavedReplyRequest
      ctx: { user: { id: string } }
    }) => {
      await db
        .delete(savedReplyModel)
        .where(
          and(
            eq(savedReplyModel.userId, ctx.user.id),
            eq(savedReplyModel.id, parsedInput.id),
          ),
        )

      revalidateCacheTags(`users:${ctx.user.id}#savedReplies`)
    },
  )
