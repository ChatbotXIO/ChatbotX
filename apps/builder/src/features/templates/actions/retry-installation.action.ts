"use server"

import { templateInstallationRequestService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { enqueueInstall } from "../lib/request-install"
import { installerActionClient } from "./installer-action-client"

/**
 * Queues a failed install again. Like the installs page, it needs only the
 * permission to see installs: an installer without `flows` (an `ecommerce`
 * member installing a products template) must be able to retry their own
 * install. The service re-authorizes the retrier against the template's
 * current contents and makes them the installing user the worker checks.
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
