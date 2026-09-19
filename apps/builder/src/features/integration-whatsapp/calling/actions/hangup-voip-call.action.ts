"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceActionClient } from "@/lib/safe-action"
import { endVoipCallAsAgent } from "./end-voip-call-as-agent"

const hangupVoipCallSchema = z.object({
  whatsappCallId: zodBigintAsString(),
})

/**
 * Ends an ACTIVE (already accepted) WhatsApp call: a Graph action plus the
 * fenced control/DB/offer cleanup, shared via {@link endVoipCallAsAgent},
 * which derives the terminal DB status from the phase the call was actually
 * ended from (`whatsappVoipCallService.endCall`'s `terminalStatus`).
 * Idempotent: a call already terminated elsewhere is a no-op success.
 */
export const hangupWhatsappVoipCallAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(hangupVoipCallSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [workspaceId], ctx }) => {
    await endVoipCallAsAgent({
      whatsappCallId: parsedInput.whatsappCallId,
      workspaceId,
      userId: ctx.user.id,
      graphFailureLog:
        "WhatsApp VoIP call hangup: Graph action failed (call still finalized locally)",
    })
    return { hungUp: true }
  })
