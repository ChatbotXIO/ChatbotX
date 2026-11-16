"use server"

import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"
import { disconnectLineChannel } from "../lib/manage-line"

/** Same function as the public `lineChannels.delete` procedure. */
export const disconnectLineAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      await disconnectLineChannel({ workspaceId, id })
    },
  )
