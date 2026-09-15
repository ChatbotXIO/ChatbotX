"use server"

import { integrationOpenaiCompatibleService } from "@chatbotx.io/business"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const disconnectOpenaiCompatibleAction =
  workspaceActionClientAllowExpired
    .bindArgsSchemas(workspaceIdAndIdRequestParams)
    .action(
      async ({
        bindArgsParsedInputs: [workspaceId, integrationId],
      }: {
        bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
      }) => {
        await integrationOpenaiCompatibleService.disconnect(
          workspaceId,
          integrationId,
        )
      },
    )
