"use server"

import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { processMissedComments } from "../lib/missed-comments/process-missed-comments"

/**
 * "Process missed comments" for one comment automation, on any channel.
 * Returns a result instead of throwing on an expected refusal, so the dialog
 * can show a translated reason.
 */
export const processMissedCommentsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => await processMissedComments({ workspaceId, id }),
  )
