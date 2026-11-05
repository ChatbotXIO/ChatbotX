"use server"

import { templateInstallationRequestService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { enqueueInstall } from "../lib/request-install"
import { installerActionClient } from "./installer-action-client"

/**
 * Needs only the permission to see installs, so an installer without `flows`
 * can retry their own install; the service re-authorizes against the
 * template's current contents.
 */
export const retryInstallationAction = installerActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    async ({
      ctx: { user, templateActor },
      bindArgsParsedInputs: [workspaceId, installationId],
    }) => {
      const installation = await templateInstallationRequestService.retry({
        workspaceId,
        installationId,
        actor: templateActor,
        retriedBy: user.id,
      })
      await enqueueInstall(installation.id, installation.workspaceId)
      return { installationId: installation.id }
    },
  )
