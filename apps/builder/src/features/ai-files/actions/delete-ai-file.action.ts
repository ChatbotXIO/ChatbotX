"use server"

import { prisma } from "@aha.chat/database"
import { uploader } from "@aha.chat/filesystem"
import { z } from "zod"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { invalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

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
      throw new Error("AI file not found")
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
        } catch {
          // try next candidate
        }
      }
    } catch {
      // ignore storage deletion error
    }

    // Delete AIFile (will cascade delete AIEmbeddings)
    await prisma.aIFile.delete({ where: { id: aiFileId, chatbotId } })

    invalidateCacheTags(`chatbots:${chatbotId}#aiFiles`)
    return { success: true }
  })


