"use server"

import { assertPublicUrl } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { integrationApiRepository } from "@chatbotx.io/database/repositories"
import type { ApiAuthValue } from "@chatbotx.io/integration-api"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { findIntegrationApiByWorkspaceAndId } from "@/features/integration-api/queries"
import { workspaceActionClient } from "@/lib/safe-action"
import type { UpdateApiRequest } from "../schema/mutation"
import { updateApiRequest } from "../schema/mutation"

export const updateApiAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(updateApiRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
      parsedInput: UpdateApiRequest
    }) => {
      if (parsedInput.callbackUrl) {
        await assertPublicUrl(
          parsedInput.callbackUrl,
          "API channel callback URL",
        )
      }

      const existing = await findIntegrationApiByWorkspaceAndId({
        id,
        workspaceId,
      })

      const auth = existing.auth as ApiAuthValue
      const nextAuth: ApiAuthValue =
        parsedInput.callbackUrl === undefined
          ? auth
          : { ...auth, callbackUrl: parsedInput.callbackUrl }

      await integrationApiRepository.updateSettings({
        id,
        workspaceId,
        name: parsedInput.name,
        callbackUrl: parsedInput.callbackUrl,
        auth: nextAuth,
      })

      await auditService.record({
        workspaceId,
        action: "update",
        detail: `updated the API key configuration (#${id})`,
      })
    },
  )
