"use server"

import { auditService } from "@chatbotx.io/business/audit"
import { generateApiChannelToken } from "@chatbotx.io/business/workspace-api-token/credentials"
import { integrationApiRepository } from "@chatbotx.io/database/repositories"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { findIntegrationApiByWorkspaceAndId } from "@/features/integration-api/queries"
import { workspaceActionClient } from "@/lib/safe-action"

export const rotateApiTokenAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      await findIntegrationApiByWorkspaceAndId({ id, workspaceId })

      const { token, tokenHash, tokenPrefix } = await generateApiChannelToken()

      await integrationApiRepository.rotateToken({
        id,
        workspaceId,
        tokenHash,
        tokenPrefix,
      })

      await auditService.record({
        workspaceId,
        action: "update",
        detail: `rotated the API key (#${id})`,
      })

      return { token }
    },
  )
