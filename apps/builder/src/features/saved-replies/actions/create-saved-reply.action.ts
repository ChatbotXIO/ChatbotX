"use server"

import { db } from "@chatbotx.io/database/client"
import { savedReplyModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { createSavedReplyRequest } from "../schema/mutation"

export const createSavedReplyAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createSavedReplyRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props
    const savedReply = await db
      .insert(savedReplyModel)
      .values({
        id: createId(),
        workspaceId,
        shortcut: parsedInput.shortcut,
        text: parsedInput.text,
      })
      .returning()
      .then((result) => result[0])

    revalidateCacheTags(`workspaces:${workspaceId}#savedReplies`)

    return savedReply
  })
