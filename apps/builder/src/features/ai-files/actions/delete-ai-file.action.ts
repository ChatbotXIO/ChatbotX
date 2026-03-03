"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { aiEmbeddingModel, aiFileModel } from "@aha.chat/database/schema"
import type { AIFileModel } from "@aha.chat/database/types"
import { uploader } from "@aha.chat/filesystem"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { logger } from "@/lib/log"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteAIFileAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs }) => {
    const [chatbotId, aiFileId] = bindArgsParsedInputs

    const targetAIFile = await findOrFail<AIFileModel>(
      aiFileModel,
      {
        id: aiFileId,
        chatbotId,
      },
      `AIFile with id ${aiFileId} not found`,
    )

    try {
      await db.transaction(async (tx) => {
        await uploader.deleteObject(targetAIFile.path)
        await tx
          .delete(aiEmbeddingModel)
          .where(eq(aiEmbeddingModel.aiFileId, aiFileId))
        await tx.delete(aiFileModel).where(eq(aiFileModel.id, aiFileId))
      })

      revalidateCacheTags(`chatbots:${chatbotId}#aiFiles`)
    } catch (error) {
      logger.warn(error, `deleteAIFileAction failed for aiFileId: ${aiFileId}`)
    }
  })
