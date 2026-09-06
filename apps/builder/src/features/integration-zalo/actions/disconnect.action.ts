"use server"

import { workspaceService, zaloIntegrationService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import {
  isRevokedTokenError,
  type ZaloAuthValue,
} from "@chatbotx.io/integration-zalo"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const disconnectZaloAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props
    const [integrationZalo, workspace] = await Promise.all([
      zaloIntegrationService.findById({ id, workspaceId }),
      workspaceService.findById({ id: workspaceId }),
    ])

    try {
      await integrations.zalo.disconnect(integrationZalo.auth as ZaloAuthValue)
    } catch (error) {
      logger.warn(
        error,
        "Zalo disconnect API call failed — proceeding with local cleanup",
      )

      if (!isRevokedTokenError(error)) {
        throw error
      }
    }

    await zaloIntegrationService.disconnect({
      workspaceId,
      id: integrationZalo.id,
      inboxId: integrationZalo.inboxId,
      ownerId: workspace.ownerId,
    })

    await auditService.record({
      action: "disconnect",
      detail: `disconnected the Zalo channel (#${integrationZalo.id})`,
    })
  })
