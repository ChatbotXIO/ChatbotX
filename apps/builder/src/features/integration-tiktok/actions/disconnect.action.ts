"use server"

import {
  tiktokIntegrationService,
  workspaceService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const disconnectTiktokAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      const [integrationTiktok, workspace] = await Promise.all([
        tiktokIntegrationService.findById({ id, workspaceId }),
        workspaceService.findById({ id: workspaceId }),
      ])

      await tiktokIntegrationService.disconnect({
        workspaceId,
        id: integrationTiktok.id,
        inboxId: integrationTiktok.inboxId,
        ownerId: workspace.ownerId,
      })

      await auditService.record({
        action: "disconnect",
        detail: `disconnected the TikTok channel (#${integrationTiktok.id})`,
      })
    },
  )
