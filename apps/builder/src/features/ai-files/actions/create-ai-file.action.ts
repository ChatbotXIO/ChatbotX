"use server"

import { prisma } from "@aha.chat/database"
import { enqueueProcessAiFileJob } from "@aha.chat/worker-config"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { invalidateCacheTags } from "@/lib/cache-helper"
import { logger } from "@/lib/log"
import { chatbotActionClient } from "@/lib/safe-action"
import { createAiFileRequest } from "../schemas"
import { getFilePathFromRelative } from "../services/file-processing.service"

export const createAiFileAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(createAiFileRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [chatbotId] = bindArgsParsedInputs

    const created = await prisma.aIFile.create({
      data: {
        chatbotId,
        ...parsedInput,
      },
    })

    // Enqueue embedding job right after creation
    const filePath = await getFilePathFromRelative(created.path)
    await enqueueProcessAiFileJob({
      chatbotId,
      aiFileId: created.id,
      filePath,
      mimeType: created.mimeType,
    })

    logger.info(
      `[AI_FILE_CREATE] Enqueued embedding job: { chatbotId: ${chatbotId}, aiFileId: ${created.id} }`,
    )

    invalidateCacheTags(`chatbots:${chatbotId}#aiFiles`)
  })
