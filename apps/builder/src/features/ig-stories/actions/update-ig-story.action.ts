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
      // `type` is immutable once set — it decides which shared-table rows
      // `findOrFail` scopes to, so it must never be forwarded into the update
      // payload even though the request schema still carries it.
      const { type: _type, ...data } = parsedInput
      await igStoryAutomationService.update({ workspaceId, id }, data)
    },
  )
