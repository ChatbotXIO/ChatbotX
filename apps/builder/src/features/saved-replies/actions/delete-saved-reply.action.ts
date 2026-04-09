"use server"

import { and, db, eq } from "@chatbotx.io/database/client"
import { savedReplyModel } from "@chatbotx.io/database/schema"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteSavedReplyAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await db
      .delete(savedReplyModel)
      .where(
        and(
          eq(savedReplyModel.workspaceId, workspaceId),
          eq(savedReplyModel.id, id),
        ),
      )

    revalidateCacheTags(`workspaces:${workspaceId}#savedReplies`)
  })
