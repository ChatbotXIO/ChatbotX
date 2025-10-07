"use server"

import { prisma } from "@aha.chat/database"
import { uploader } from "@aha.chat/filesystem"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { invalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { logger } from "../../../lib/log"

export const deleteAiFileAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .action(async ({ bindArgsParsedInputs }) => {
    const [chatbotId, aiFileId] = bindArgsParsedInputs

    const aiFile = await prisma.aIFile.findUniqueOrThrow({
      where: { id: aiFileId, chatbotId },
    })

    try {
      const key = aiFile.path
      await uploader.deleteObject(key)
    } catch (error) {
      logger.warn("[ai-files] storage deletion failed", {
        error,
        aiFileId: aiFile.id,
        path: aiFile.path,
      })
    }

    await prisma.$transaction([
      prisma.aIEmbedding.deleteMany({ where: { aiFileId, chatbotId } }),
      prisma.aIFile.delete({ where: { id: aiFileId, chatbotId } }),
    ])

    invalidateCacheTags(`chatbots:${chatbotId}#aiFiles`)
  })
