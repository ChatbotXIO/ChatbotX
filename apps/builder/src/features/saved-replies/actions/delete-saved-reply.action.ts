"use server"

import { and, db, eq } from "@chatbotx.io/database/client"
import { savedReplyModel } from "@chatbotx.io/database/schema"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"

export const deleteSavedReplyAction = authActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [_chatbotId, id],
      ctx,
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
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
