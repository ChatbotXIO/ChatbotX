"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import {
  type GoogleSheetsAuthValue,
  integration as integrationGoogleSheets,
} from "@ahachat.ai/integration-google-sheets"

export const disconnectGoogleSheets = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
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
          "Unable to disconnect google sheets for chatbot",
          { chatbotId },
          e,
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
