"use server"

import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { testLineWebhook } from "../lib/manage-line"

/** Same function as the public `lineChannels.testWebhook` procedure. */
export const testLineWebhookAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => testLineWebhook({ workspaceId, id }),
  )
