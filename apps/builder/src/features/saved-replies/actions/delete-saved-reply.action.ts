"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
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

    const savedReply = await findOrFail({
      table: savedReplyModel,
      where: {
        id,
        workspaceId,
      },
      message: "Saved reply not found",
    })

    await db
      .delete(savedReplyModel)
      .where(eq(savedReplyModel.id, savedReply.id))

    revalidateCacheTags(`workspaces:${workspaceId}#savedReplies`)
  })
