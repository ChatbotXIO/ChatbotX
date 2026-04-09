"use server"

import { and, db, eq } from "@chatbotx.io/database/client"
import { savedReplyModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { editSavedReplyRequest } from "../schema/mutation"

export const editSavedReplyAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()] as const)
  .inputSchema(editSavedReplyRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props
    const savedReply = await db
      .update(savedReplyModel)
      .set({
        shortcut: parsedInput.shortcut,
        text: parsedInput.text,
      })
      .where(
        and(
          eq(savedReplyModel.id, id),
          eq(savedReplyModel.workspaceId, workspaceId),
        ),
      )
      .returning({
        id: savedReplyModel.id,
        shortcut: savedReplyModel.shortcut,
        text: savedReplyModel.text,
      })
      .then((result) => result[0])

    revalidateCacheTags(`workspaces:${workspaceId}#savedReplies`)

    return savedReply
  })
