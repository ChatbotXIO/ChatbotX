"use server"

import {
  inboxService,
  tiktokIntegrationService,
  workspaceService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { db } from "@chatbotx.io/database/client"
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

      await db.transaction(async (tx) => {
        await tiktokIntegrationService.disconnect({
          id: integrationTiktok.id,
          tx,
        })
        await inboxService.disconnect({
          inboxId: integrationTiktok.inboxId,
          ownerId: workspace.ownerId,
          workspaceId,
          reason: "manual",
          tx,
        })
      })

      await auditService.record({
        action: "disconnect",
        detail: `disconnected the TikTok channel (#${integrationTiktok.id})`,
      })
    },
  )
