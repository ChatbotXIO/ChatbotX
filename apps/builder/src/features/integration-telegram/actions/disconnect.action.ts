"use server"

import {
  telegramIntegrationService,
  workspaceService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import type { TelegramAuthValue } from "@chatbotx.io/integration-telegram"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const disconnectTelegramAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      const [integrationTelegram, workspace] = await Promise.all([
        telegramIntegrationService.findByIdForWorkspace({ id, workspaceId }),
        workspaceService.findById({ id: workspaceId }),
      ])

      try {
        await integrations.telegram.disconnect(
          integrationTelegram.auth as TelegramAuthValue,
        )
      } catch (error) {
        logger.warn(
          error,
          "Telegram disconnect API call failed — proceeding with local cleanup",
        )
      }

      await telegramIntegrationService.disconnect({
        workspaceId,
        id: integrationTelegram.id,
        inboxId: integrationTelegram.inboxId,
        ownerId: workspace.ownerId,
      })

      await auditService.record({
        action: "disconnect",
        detail: `disconnected the Telegram channel (#${integrationTelegram.id})`,
      })
    },
  )
