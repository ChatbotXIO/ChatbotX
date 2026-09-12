"use server"

import { igStoryAutomationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateIgStoryRequest,
  updateIgStoryRequest,
} from "../schema/action"

export const updateIgStoryAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateIgStoryRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [string, string]
      parsedInput: UpdateIgStoryRequest
    }) => {
      await igStoryAutomationService.update({ workspaceId, id }, parsedInput)
    },
  )
