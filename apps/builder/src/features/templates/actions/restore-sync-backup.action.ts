"use server"

import { templateSyncRestoreService } from "@chatbotx.io/business/template-sync/restore"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { installerActionClient } from "./installer-action-client"

/** Puts back what a sync overwrote on an edited copy (flows restore into the draft only). */
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
