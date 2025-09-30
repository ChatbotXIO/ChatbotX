"use server"

import { prisma } from "@aha.chat/database"
import { enqueueProcessAiFileJob } from "@aha.chat/worker-config"
import { z } from "zod"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { invalidateCacheTags } from "@/lib/cache-helper"
import { logger } from "@/lib/log"
import { chatbotActionClient } from "@/lib/safe-action"
import { getFilePathFromRelative } from "../services/file-processing.service"

const processAiFileEmbeddingRequest = z.object({
  aiFileId: z.string(),
})

export const processAiFileEmbeddingAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(processAiFileEmbeddingRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [chatbotId] = bindArgsParsedInputs
    const { aiFileId } = parsedInput

    // Get AI file
    const aiFile = await prisma.aIFile.findUnique({
      where: {
        id: aiFileId,
        chatbotId,
      },
    })

    if (!aiFile) {
      throw new Error("AI file not found")
    }

    // Enqueue processing job for embeddings
    const filePath = await getFilePathFromRelative(aiFile.path)
    logger.info(`[AI_FILE_PROCESSING] Processing file: ${aiFile.name}`)
    logger.info(`[AI_FILE_PROCESSING] File path: ${filePath}`)
    logger.info(`[AI_FILE_PROCESSING] MIME type: ${aiFile.mimeType}`)

    enqueueProcessAiFileJob({
      chatbotId,
      aiFileId: aiFile.id,
      filePath,
      mimeType: aiFile.mimeType,
    })

    invalidateCacheTags(`chatbots:${chatbotId}#aiFiles`)

    return { success: true }
  })
