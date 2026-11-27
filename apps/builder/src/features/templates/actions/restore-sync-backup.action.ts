"use server"

import { templateSyncRestoreService } from "@chatbotx.io/business/template-sync/restore"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { installerActionClient } from "./installer-action-client"

export const restoreSyncBackupAction = installerActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(z.object({ backupId: zodBigintAsString() }))
  .action(
    async ({
      ctx: { templateActor },
      bindArgsParsedInputs: [workspaceId, installationId],
      parsedInput: { backupId },
    }) => {
      await templateSyncRestoreService.restoreBackup({
        workspaceId,
        installationId,
        backupId,
        actor: templateActor,
      })
      return { backupId }
    },
  )
