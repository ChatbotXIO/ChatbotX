"use server"

import { inboxService } from "@chatbotx.io/business"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationWebchatModel } from "@chatbotx.io/database/schema"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteWebchatAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      const integrationWebchat = await findOrFail({
        table: integrationWebchatModel,
        where: { workspaceId, id },
        message: "Integration Webchat not found",
      })

      await db.transaction(async (tx) => {
        await tx
          .delete(integrationWebchatModel)
          .where(eq(integrationWebchatModel.id, integrationWebchat.id))

        await inboxService.disconnect({
          inboxId: integrationWebchat.inboxId,
          tx,
        })
      })
    },
  )
