"use server"

import { commentAutomationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

/** Bounded by the largest page a comment automation table shows. */
const MAX_AUTOMATION_IDS = 500

const getMissedCommentsInProgressRequest = z.object({
  ids: z.array(zodBigintAsString()).max(MAX_AUTOMATION_IDS),
})

/**
 * Which of the listed automations are processing missed comments right now,
 * for the "processing" status the comment automation tables poll.
 */
export const getMissedCommentsInProgressAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(getMissedCommentsInProgressRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: z.infer<typeof getMissedCommentsInProgressRequest>
    }) => ({
      ids: await commentAutomationService.findMissedCommentsInProgress({
        workspaceId,
        automationIds: parsedInput.ids,
      }),
    }),
  )
