"use server"

import { prisma } from "@aha.chat/database"
import { enqueueProcessAiFileJob } from "@aha.chat/worker-config"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { invalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { createAiFileRequest } from "../schemas"

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
    await enqueueProcessAiFileJob({
      chatbotId,
      aiFileId: created.id,
      filePath: created.path,
      mimeType: created.mimeType,
    })

    invalidateCacheTags(`chatbots:${chatbotId}#aiFiles`)
  })
