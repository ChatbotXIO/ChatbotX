"use server"

import { db } from "@chatbotx.io/database/client"
import { aiFileModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { AIJobAction, aiAgentQueue } from "@chatbotx.io/worker-config"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { createAIFileRequest } from "../schemas"

export const createAIFileAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createAIFileRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [chatbotId] = bindArgsParsedInputs

    const created = await db
      .insert(aiFileModel)
      .values({
        ...parsedInput,
        id: createId(),
        chatbotId,
      })
      .returning({ id: aiFileModel.id })

    // Enqueue embedding job right after creation
    await aiAgentQueue.add(AIJobAction.processAIFile, {
      type: AIJobAction.processAIFile,
      data: {
        aiFileId: created[0].id,
      },
    })

    revalidateCacheTags(`chatbots:${chatbotId}#aiFiles`)
  })
