"use server"

import { prisma } from "@aha.chat/database"
import { AIJobAction, aiAgentQueue } from "@aha.chat/worker-config"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { createAIFileRequest } from "../schemas"

export const createAIFileAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createAIFileRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [chatbotId] = bindArgsParsedInputs

    const created = await prisma.aIFile.create({
      data: {
        chatbotId,
        ...parsedInput,
      },
    })

    // Enqueue embedding job right after creation
    await aiAgentQueue.add(AIJobAction.processAIFile, {
      type: AIJobAction.processAIFile,
      data: {
        aiFileId: created.id,
      },
    })

    revalidateCacheTags(`chatbots:${chatbotId}#aiFiles`)
  })
