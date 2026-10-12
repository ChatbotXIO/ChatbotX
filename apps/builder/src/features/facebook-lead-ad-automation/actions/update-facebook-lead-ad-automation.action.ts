"use server"

import { facebookLeadAdsAutomationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateFacebookLeadAdAutomationRequest,
  updateFacebookLeadAdAutomationRequest,
} from "../schema/action"

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
      // Drizzle's `.set()` skips `undefined` keys, but throws "No values to
      // set" if every key is undefined — callers must send at least one field.
      await facebookLeadAdsAutomationService.update(
        { workspaceId, id },
        parsedInput,
      )
    },
  )
