"use server"

import { prisma } from "@aha.chat/database"
import { uploader } from "@aha.chat/filesystem"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { logger } from "../../../lib/log"

export const deleteAIFileAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs }) => {
    const [chatbotId, aiFileId] = bindArgsParsedInputs

    const aiFile = await prisma.aIFile.findUniqueOrThrow({
      where: { id: aiFileId, chatbotId },
    })

    try {
      await prisma.$transaction(async (tx) => {
        await uploader.deleteObject(aiFile.path)
        await tx.aIEmbedding.deleteMany({ where: { aiFileId, chatbotId } })
        await tx.aIFile.delete({ where: { id: aiFileId, chatbotId } })
      })

      revalidateCacheTags(`chatbots:${chatbotId}#aiFiles`)
    } catch (error) {
      logger.warn(error, `deleteAIFileAction failed for aiFileId: ${aiFileId}`)
    }
  })
