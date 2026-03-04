"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import {
  integrationGoogleSheetsModel,
  integrationModel,
} from "@aha.chat/database/schema"
import type { IntegrationGoogleSheetsModel } from "@aha.chat/database/types"
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
      const googleSheets = await findOrFail<IntegrationGoogleSheetsModel>(
        integrationGoogleSheetsModel,
        {
          chatbotId,
        },
        "Integration Google Sheets not found",
      )
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

      await db.transaction(async (tx) => {
        await tx
          .delete(integrationModel)
          .where(eq(integrationModel.id, googleSheets.integrationId))
      })
      return
    },
  )
