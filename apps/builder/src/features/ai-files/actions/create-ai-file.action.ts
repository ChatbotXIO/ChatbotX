"use server"

import { db } from "@chatbotx.io/database/client"
import { aiFileModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { AIJobAction, aiAgentQueue } from "@chatbotx.io/worker-config"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { createAIFileRequest } from "../schemas"

export const createAIFileAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAIFileRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs

    const created = await db
      .insert(aiFileModel)
      .values({
        ...parsedInput,
        id: createId(),
        workspaceId,
      })
      .returning({ id: aiFileModel.id })

    // Enqueue embedding job right after creation
    await aiAgentQueue.add(AIJobAction.processAIFile, {
      type: AIJobAction.processAIFile,
      data: {
        aiFileId: created[0].id,
      },
    })

    revalidateCacheTags(`workspaces:${workspaceId}#aiFiles`)
  })
