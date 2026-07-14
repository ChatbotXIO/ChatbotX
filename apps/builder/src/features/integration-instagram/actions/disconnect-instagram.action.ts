"use server"

import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"
import { disconnectInstagram } from "./disconnect-instagram"

export const disconnectInstagramAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationInstagramId],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      await disconnectInstagram({ workspaceId, integrationInstagramId })
    },
  )
