"use server"

import { prisma } from "@aha.chat/database"
import { z } from "zod"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { invalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

const deleteAiFileEmbeddingsRequest = z.object({
    aiFileId: z.string(),
})

export const deleteAiFileEmbeddingsAction = chatbotActionClient
    .bindArgsSchemas(chatbotIdRequestParams.items)
    .inputSchema(deleteAiFileEmbeddingsRequest)
    .action(async ({ bindArgsParsedInputs, parsedInput }) => {
        const [chatbotId] = bindArgsParsedInputs
        const { aiFileId } = parsedInput

        await prisma.aIEmbedding.deleteMany({
            where: {
                chatbotId,
                aiFileId,
            },
        })

        invalidateCacheTags(`chatbots:${chatbotId}#aiFiles`)
        return { success: true }
    })


