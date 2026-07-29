"use server"

import { facebookLeadAdsAutomationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateFacebookLeadAdAutomationRequest,
  updateFacebookLeadAdAutomationRequest,
} from "../schemas/action"

export const updateFacebookLeadAdAutomationAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateFacebookLeadAdAutomationRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [string, string]
      parsedInput: UpdateFacebookLeadAdAutomationRequest
    }) => {
      // Drizzle's `.set()` skips `undefined` keys, so pass the partial input
      // straight through (an explicit `flowId: null` still clears the column).
      await facebookLeadAdsAutomationService.update(
        { workspaceId, id },
        parsedInput,
      )
    },
  )
