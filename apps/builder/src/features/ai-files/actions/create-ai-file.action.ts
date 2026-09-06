"use server"

import { aiFileService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createAIFileRequest } from "../schema"

export const createAIFileAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAIFileRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs

    try {
      await aiFileService.create({ workspaceId, ...parsedInput })
    } catch (error) {
      if (
        error instanceof ChatbotXException &&
        error.code === "noEmbeddingProvider"
      ) {
        const t = await getTranslations("aiFiles")
        throw new ChatbotXException(t("noEmbeddingProvider"))
      }
      throw error
    }
  })
