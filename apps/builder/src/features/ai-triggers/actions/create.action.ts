"use server"

import { db } from "@chatbotx.io/database/client"
import { aiTriggerModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { createAITriggerRequest } from "@/features/ai-triggers/schemas/action"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const createAITriggerAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAITriggerRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props

    await db.insert(aiTriggerModel).values({
      ...parsedInput,
      workspaceId,
      id: createId(),
    })

    revalidateCacheTags(`workspaces:${workspaceId}#aiTriggers`)
  })
