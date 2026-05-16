"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import {
  inboxModel,
  integrationInstagramModel,
} from "@chatbotx.io/database/schema"
import {
  type InstagramAuthValue,
  isRevokedTokenError,
} from "@chatbotx.io/integration-instagram"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { integrations } from "@/integration"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"

export const disconnectInstagramAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationInstagramId],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      const integrationInstagram = await findOrFail({
        table: integrationInstagramModel,
        where: {
          id: integrationInstagramId,
          workspaceId,
        },
        message: "Integration Instagram not found",
      })

      const authValue = integrationInstagram.auth as InstagramAuthValue

      try {
        await integrations.instagram.disconnect(authValue)
      } catch (error) {
        logger.warn(
          error,
          "Instagram disconnect API call failed — proceeding with local cleanup",
        )

        if (!isRevokedTokenError(error)) {
          throw error
        }
      }

      await db.transaction(async (tx) => {
        await tx
          .delete(integrationInstagramModel)
          .where(eq(integrationInstagramModel.id, integrationInstagram.id))

        await tx
          .update(inboxModel)
          .set({ status: inboxStatuses.enum.disconnected })
          .where(eq(inboxModel.id, integrationInstagram.inboxId))
      })

      revalidateCacheTags([
        `workspaces:${workspaceId}#instagram`,
        `workspaces:${workspaceId}#inboxes`,
      ])
    },
  )
