"use server"

import { whatsappVoipCallService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { callingActionClient } from "@/lib/safe-action"

const getOutboundVoipAnswerSchema = z.object({
  whatsappCallId: zodBigintAsString(),
})

/**
 * Recovery for an outbound call's SDP answer. The answer is pushed once over
 * realtime; when the agent's tab missed it and the gateway could not replay it,
 * the browser asks for it here instead of waiting forever for a call that never
 * connects. Only the agent who started a live outbound call gets the SDP
 * (`whatsappVoipCallService.readOutboundAnswerForInitiator`); everything else
 * is `{ sdp: null }`, never an error, so a call that already ended or an answer
 * that has expired is not a failure.
 *
 * Realtime recovery plumbing for the push above, so it has no public API
 * counterpart (AGENTS.md invariant 23, UI-only plumbing exemption).
 */
export const getOutboundVoipAnswerAction = callingActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(getOutboundVoipAnswerSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
      ctx,
    }): Promise<{ sdp: string | null }> => {
      const answer =
        await whatsappVoipCallService.readOutboundAnswerForInitiator({
          userId: ctx.user.id,
          whatsappCallId: parsedInput.whatsappCallId,
          workspaceId,
        })
      return { sdp: answer?.sdp ?? null }
    },
  )
