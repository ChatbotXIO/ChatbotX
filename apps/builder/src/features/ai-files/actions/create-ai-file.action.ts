"use server"

import { db } from "@aha.chat/database/client"
import { aiFileModel } from "@aha.chat/database/schema"
import { AIJobAction, aiAgentQueue } from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
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
