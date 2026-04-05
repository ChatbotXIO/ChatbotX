"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import {
  integrationGoogleSheetsModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import {
  type GoogleSheetsAuthValue,
  integration as integrationGoogleSheets,
} from "@chatbotx.io/integration-google-sheets"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"

export const disconnectGoogleSheets = authActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const googleSheets = await findOrFail({
        table: integrationGoogleSheetsModel,
        where: {
          workspaceId,
        },
        message: "Integration Google Sheets not found",
      })
      try {
        await integrationGoogleSheets.disconnect?.(
          googleSheets.auth as GoogleSheetsAuthValue,
        )
      } catch (e) {
        logger.error(
          e,
          `Unable to disconnect google sheets for workspace: ${workspaceId}`,
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
