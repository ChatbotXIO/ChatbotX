"use server"

import { prisma } from "@aha.chat/database"
import { uploader } from "@aha.chat/filesystem"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { invalidateCacheTags } from "@/lib/cache-helper"
import { NotfoundException } from "@/lib/error"
import { chatbotActionClient } from "@/lib/safe-action"
import { logger } from "../../../lib/log"

const deleteAiFileRequest = z.object({
  aiFileId: z.string(),
})

export const deleteAiFileAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(deleteAiFileRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [chatbotId] = bindArgsParsedInputs
    const { aiFileId } = parsedInput

    // Find file to get path for storage deletion
    const aiFile = await prisma.aIFile.findUnique({
      where: { id: aiFileId, chatbotId },
    })
    if (!aiFile) {
      const t = await getTranslations()
      throw new NotfoundException(t("errors.aiFile.notFound"))
    }

    // Best-effort: delete object on S3/MinIO; try both with and without public/ prefix
    try {
      const candidates: string[] = [aiFile.path]
      if (aiFile.path.startsWith("public/")) {
        candidates.push(aiFile.path.slice(7))
      } else {
        candidates.push(`public/${aiFile.path}`)
      }
      for (const key of candidates) {
        try {
          await uploader.headObject(key)
          await uploader.deleteObject(key)
          break
        } catch (error) {
          logger.debug(
            "[ai-files] Skip candidate key (not found or delete failed)",
            { key, error },
          )
        }
      }
    } catch (error) {
      logger.warn("[ai-files] Best-effort storage deletion failed", {
        error,
        aiFileId: aiFile.id,
        path: aiFile.path,
      })
    }

    // Delete AIFile (will cascade delete AIEmbeddings)
    await prisma.aIFile.delete({ where: { id: aiFileId, chatbotId } })

    invalidateCacheTags(`chatbots:${chatbotId}#aiFiles`)
    return { success: true }
  })
