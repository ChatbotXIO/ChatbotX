"use server"

import { inboxService, workspaceService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationTiktokModel } from "@chatbotx.io/database/schema"
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
        findOrFail({
          table: integrationTiktokModel,
          where: { workspaceId, id },
          message: "Integration TikTok not found",
        }),
        workspaceService.findById({ id: workspaceId }),
      ])

      await db.transaction(async (tx) => {
        await tx
          .delete(integrationTiktokModel)
          .where(eq(integrationTiktokModel.id, integrationTiktok.id))
        await inboxService.disconnect({
          inboxId: integrationTiktok.inboxId,
          ownerId: workspace.ownerId,
          workspaceId,
          tx,
        })
      })

      await auditService.record({
        action: "disconnect",
        detail: `disconnected the TikTok channel (#${integrationTiktok.id})`,
      })
    },
  )
