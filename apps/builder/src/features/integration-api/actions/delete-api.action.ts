"use server"

import { integrationApiService, workspaceService } from "@chatbotx.io/business"
import type { ApiAuthValue } from "@chatbotx.io/integration-api"
import { integration as integrationApi } from "@chatbotx.io/integration-api"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { findIntegrationApiByWorkspaceAndId } from "@/features/integration-api/queries"
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
        findIntegrationApiByWorkspaceAndId({ workspaceId, id }),
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

      await integrationApiService.disconnect({
        id: integrationApiRow.id,
        inboxId: integrationApiRow.inboxId,
        workspaceId,
        ownerId: workspace.ownerId,
      })
    },
  )
