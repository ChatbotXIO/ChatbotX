"use server"

import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"
import { disconnectThreads } from "./disconnect"

export const disconnectThreadsAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationThreadsId],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      await disconnectThreads({ workspaceId, integrationThreadsId })
    },
  )
