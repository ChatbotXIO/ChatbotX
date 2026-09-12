"use server"

import { fbCommentAutomationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateIgCommentRequest,
  updateIgCommentRequest,
} from "../schema/action"

export const updateIgCommentAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateIgCommentRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [string, string]
      parsedInput: UpdateIgCommentRequest
    }) => {
      // `type` is immutable once set — it decides which shared-table rows
      // `findInstagramOrFail` scopes to, so it must never be forwarded into
      // the update payload even though the request schema still carries it.
      const { type: _type, ...data } = parsedInput
      await fbCommentAutomationService.updateInstagram(
        { workspaceId, id },
        data,
      )
    },
  )
