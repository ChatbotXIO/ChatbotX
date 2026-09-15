"use server"

import { callRecordingService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

const getCallRecordingUrlSchema = z.object({
  whatsappCallId: zodBigintAsString(),
})

/**
 * Mints a fresh 15-minute signed playback URL for a WhatsApp call recording
 * (browserWhisper or Meta-native VoIP — both attach to the same
 * `WhatsappCall` row). The URL
 * embedded in the recording's realtime `messageCreated`/an earlier page load
 * expires after `RECORDING_SIGNED_URL_TTL_SECONDS`; the inbox audio player
 * calls this on-demand (on play, or after a playback error) to avoid a 403
 * on a long-open tab. A read action — allowed even for an
 * expired/owner-blocked workspace, matching every other history-viewing
 * action (AGENTS.md invariant #14).
 *
 * `callRecordingService.getRecordingUrlForCall` re-derives the recording
 * path from the call row itself and throws when the call does not belong to
 * `workspaceId`, so a cross-workspace request is rejected rather than
 * quietly returning null.
 */
export const getCallRecordingUrlAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(getCallRecordingUrlSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const url = await callRecordingService.getRecordingUrlForCall({
      callId: parsedInput.whatsappCallId,
      workspaceId,
    })
    return { url }
  })
