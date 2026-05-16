"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import {
  inboxModel,
  integrationTelegramModel,
} from "@chatbotx.io/database/schema"
import type { TelegramAuthValue } from "@chatbotx.io/integration-telegram"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { integrations } from "@/integration"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"

export const disconnectTelegramAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      const integrationTelegram = await findOrFail({
        table: integrationTelegramModel,
        where: { workspaceId, id },
        message: "Integration Telegram not found",
      })

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

      await db.transaction(async (tx) => {
        await tx
          .delete(integrationTelegramModel)
          .where(eq(integrationTelegramModel.id, integrationTelegram.id))
        await tx
          .update(inboxModel)
          .set({ status: inboxStatuses.enum.disconnected })
          .where(eq(inboxModel.id, integrationTelegram.inboxId))
      })

      revalidateCacheTags(`workspaces:${workspaceId}#telegrams`)
    },
  )
