"use server"

import { prisma } from "@aha.chat/database"
import {
  type GoogleSheetsAuthValue,
  integration as integrationGoogleSheets,
} from "@aha.chat/integration-google-sheets"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"

export const disconnectGoogleSheets = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const googleSheets =
        await prisma.integrationGoogleSheets.findFirstOrThrow({
          where: { chatbotId },
        })
      try {
        await integrationGoogleSheets.disconnect?.(
          googleSheets.auth as GoogleSheetsAuthValue,
        )
      } catch (e) {
        logger.error(
          e,
          `Unable to disconnect google sheets for chatbot: ${chatbotId}`,
        )
      }

      await prisma.$transaction(async (tx) => {
        await tx.integration.delete({
          where: { id: googleSheets.integrationId },
        })
      })
      return
    },
  )
