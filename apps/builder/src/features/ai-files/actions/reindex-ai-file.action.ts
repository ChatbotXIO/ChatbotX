"use server"

import { aiFileService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { workspaceActionClient } from "@/lib/safe-action"
import { assertAIFileActionNotRateLimited } from "../lib/rate-limit"
import { reindexAIFileRequest } from "../schema/public"

/** Same service call as `aiFiles.reindex`; returns whether a run was already active. */
export const reindexAIFileAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(reindexAIFileRequest.pick({ chunkingConfig: true }))
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId, id] = bindArgsParsedInputs
    await assertAIFileActionNotRateLimited("reindex", workspaceId)
    try {
      const result = await aiFileService.reindex({
        workspaceId,
        id,
        chunkingConfig: parsedInput.chunkingConfig,
      })
      return { coalesced: result.coalesced }
    } catch (error) {
      if (error instanceof ChatbotXException && error.code === "conflict") {
        const t = await getTranslations()
        throw new ChatbotXException(
          t("aiFiles.reindex.conflict"),
          "conflict",
          409,
        )
      }
      throw error
    }
  })
