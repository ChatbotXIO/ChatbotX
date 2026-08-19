"use server"

import { inboxService, workspaceService } from "@chatbotx.io/business"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationApiModel } from "@chatbotx.io/database/schema"
import type { ApiAuthValue } from "@chatbotx.io/integration-api"
import { integration as integrationApi } from "@chatbotx.io/integration-api"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { logger } from "@/lib/log"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const deleteApiAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      const [integrationApiRow, workspace] = await Promise.all([
        findOrFail({
          table: integrationApiModel,
          where: { workspaceId, id },
          message: "Integration API not found",
        }),
        workspaceService.findById({ id: workspaceId }),
      ])

      try {
        await integrationApi.disconnect(integrationApiRow.auth as ApiAuthValue)
      } catch (error) {
        logger.warn(
          { err: error },
          "API channel disconnect call failed — proceeding with local cleanup",
        )
      }

      await db.transaction(async (tx) => {
        await tx
          .delete(integrationApiModel)
          .where(eq(integrationApiModel.id, integrationApiRow.id))
        await inboxService.disconnect({
          inboxId: integrationApiRow.inboxId,
          ownerId: workspace.ownerId,
          workspaceId,
          tx,
        })
      })
    },
  )
