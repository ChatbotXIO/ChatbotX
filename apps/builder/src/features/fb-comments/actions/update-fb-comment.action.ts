"use server"

import { fbCommentAutomationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateFbCommentRequest,
  updateFbCommentRequest,
} from "../schema/action"

export const updateFbCommentAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateFbCommentRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [string, string]
      parsedInput: UpdateFbCommentRequest
    }) => {
      await fbCommentAutomationService.updateMessenger(
        { workspaceId, id },
        parsedInput,
      )
    },
  )
