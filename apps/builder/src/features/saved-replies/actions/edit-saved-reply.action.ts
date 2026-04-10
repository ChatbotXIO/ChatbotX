"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
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

    const savedReply = await findOrFail({
      table: savedReplyModel,
      where: {
        id,
        workspaceId,
      },
      message: "Saved reply not found",
    })
    const [updatedSavedReply] = await db
      .update(savedReplyModel)
      .set({
        shortcut: parsedInput.shortcut,
        text: parsedInput.text,
      })
      .where(eq(savedReplyModel.id, savedReply.id))
      .returning()

    revalidateCacheTags(`workspaces:${workspaceId}#savedReplies`)

    return updatedSavedReply
  })
