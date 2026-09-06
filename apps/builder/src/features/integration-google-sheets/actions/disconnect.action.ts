"use server"

import { integrationGoogleSheetService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import {
  type GoogleSheetsAuthValue,
  integration as integrationGoogleSheets,
} from "@chatbotx.io/integration-google-sheets"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"

export const disconnectGoogleSheetsAction = authActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      const googleSheets =
        await integrationGoogleSheetService.findByWorkspaceIdOrFail(workspaceId)
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

      await integrationGoogleSheetService.disconnect({
        workspaceId,
        integrationId: googleSheets.integrationId,
      })

      await auditService.record({
        workspaceId,
        action: "disconnect",
        detail: "disconnected the Google Sheets integration",
      })

      return
    },
  )
