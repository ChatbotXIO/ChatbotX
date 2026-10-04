"use server"

import {
  importHeaderPeekErrorCodes,
  peekImportHeaders,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { workspaceActionClient } from "@/lib/safe-action"

const request = z.object({ fileId: zodBigintAsString() })

export const peekImportHeadersAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(request)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      return await peekImportHeaders({
        workspaceId,
        fileId: parsedInput.fileId,
      })
    } catch (error) {
      // The shared service speaks English + codes; the UI shows its own copy.
      if (!(error instanceof ChatbotXException)) {
        throw error
      }
      const t = await getTranslations("fields.import")
      switch (error.code) {
        case importHeaderPeekErrorCodes.unableToReadHeaders:
          throw new ChatbotXException(t("unableToReadHeaders"))
        case importHeaderPeekErrorCodes.unsupportedFileType:
          throw new ChatbotXException(t("unsupportedFileType"))
        case importHeaderPeekErrorCodes.fileTooLarge:
          throw new ChatbotXException(
            t("fileTooLarge", { size: error.data?.size ?? 0 }),
          )
        default:
          throw error
      }
    }
  })
