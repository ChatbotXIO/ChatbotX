"use server"

import { templateSyncRequestService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { enqueueSync } from "../lib/request-install"
import { syncInstallationRequest } from "../schema/mutation"
import { installerActionClient } from "./installer-action-client"

/** Like retry, needs only the permission to see installs; the service re-checks every category. */
export const syncInstallationAction = installerActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(syncInstallationRequest)
  .action(
    async ({
      ctx: { user, templateActor },
      bindArgsParsedInputs: [workspaceId, installationId],
      parsedInput,
    }) => {
      const requested = await templateSyncRequestService.request({
        workspaceId,
        installationId,
        actor: templateActor,
        trigger: "manual",
        requestedBy: user.id,
        idempotencyKey: parsedInput.idempotencyKey,
      })
      await enqueueSync(requested.syncId, requested.workspaceId)
      return { syncId: requested.syncId }
    },
  )
