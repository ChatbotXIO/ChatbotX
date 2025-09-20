"use server"

import { prisma } from "@aha.chat/database"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { invalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { z } from "zod"
import { processFileForEmbeddings, getFilePathFromRelative } from "../services/file-processing.service"

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

        // Process file for embeddings
        const filePath = await getFilePathFromRelative(aiFile.path)
        console.log(`[AI_FILE_PROCESSING] Processing file: ${aiFile.name}`)
        console.log(`[AI_FILE_PROCESSING] File path: ${filePath}`)
        console.log(`[AI_FILE_PROCESSING] MIME type: ${aiFile.mimeType}`)

        const processingResult = await processFileForEmbeddings({
            chatbotId,
            aiFileId: aiFile.id,
            filePath,
            mimeType: aiFile.mimeType,
            chunkSize: 1000,
            overlapSize: 200,
        })

        console.log(`[AI_FILE_PROCESSING] Processing result:`, processingResult)

        if (!processingResult.success) {
            console.error(`[AI_FILE_PROCESSING] Processing failed:`, processingResult.error)
            throw new Error(processingResult.error || "Failed to process file")
        }

        invalidateCacheTags(`chatbots:${chatbotId}#aiFiles`)

        return {
            success: true,
            chunksProcessed: processingResult.chunksProcessed,
        }
    })
