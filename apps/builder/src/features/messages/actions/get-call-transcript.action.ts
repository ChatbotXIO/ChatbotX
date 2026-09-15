"use server"

import { whatsappCallTranscriptService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

const getCallTranscriptSchema = z.object({
  whatsappCallId: zodBigintAsString(),
})

/**
 * Loads the diarized (VoIP/Meta-native) or flat, timestamped (SIP/Whisper)
 * transcript for the Call Information sheet, mapping
 * speaker labels to display names: `"Business"` → the agent who placed
 * (outbound) or answered (inbound) the call, `"Customer"` → the contact.
 * `hasSpeakers=false` (no `speaker` field on any segment, i.e. SIP/Whisper)
 * tells the sheet to omit the name column entirely. Empty `segments` is a
 * valid "unavailable" result, not an error. A read action — allowed even
 * for an expired/owner-blocked workspace (AGENTS.md invariant #14).
 */
export const getCallTranscriptAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(getCallTranscriptSchema)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
      await whatsappCallTranscriptService.getTranscriptForCall({
        callId: parsedInput.whatsappCallId,
        workspaceId,
      }),
  )
