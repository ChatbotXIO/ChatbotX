"use server"

import { db } from "@chatbotx.io/database/client"
import { botFieldModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { createBotFieldRequest } from "../schemas/action"

export const createBotFieldAction = workspaceActionClient
  .inputSchema(createBotFieldRequest)
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props

    if (parsedInput.folderId) {
      await ensureFolderIsExists(
        parsedInput.folderId,
        workspaceId,
        "customField",
      )
    }

    await db.insert(botFieldModel).values({
      ...parsedInput,
      id: createId(),
      workspaceId,
    })

    revalidateCacheTags(`workspaces:${workspaceId}#botFields`)
  })
