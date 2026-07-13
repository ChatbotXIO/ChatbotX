"use server"

import { inboxService } from "@chatbotx.io/business"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationTiktokModel } from "@chatbotx.io/database/schema"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const disconnectTiktokAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      const integrationTiktok = await findOrFail({
        table: integrationTiktokModel,
        where: { workspaceId, id },
        message: "Integration TikTok not found",
      })

      await db.transaction(async (tx) => {
        await tx
          .delete(integrationTiktokModel)
          .where(eq(integrationTiktokModel.id, integrationTiktok.id))
        await inboxService.disconnect({
          inboxId: integrationTiktok.inboxId,
          tx,
        })
      })
    },
  )
