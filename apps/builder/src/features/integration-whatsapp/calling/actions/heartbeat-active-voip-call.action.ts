"use server"

import { whatsappVoipCallService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceActionClient } from "@/lib/safe-action"

const heartbeatActiveVoipCallSchema = z.object({
  wacid: z.string().min(1),
})

/**
 * Liveness ping from the tab holding an `accepted` VoIP call, so a stranded
 * call (lost terminate webhook) can be told apart from one still live past
 * the safety-net TTL. Delegates to
 * `whatsappVoipCallService.heartbeatActiveCall`, which verifies ownership and
 * `phase:"accepted"` before writing — a heartbeat for a call this agent
 * doesn't own, or that already ended, returns `{ ok: false }` rather than
 * throwing.
 */
export const heartbeatActiveVoipCallAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(heartbeatActiveVoipCallSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
      ctx,
    }): Promise<{ ok: boolean }> => {
      const ok = await whatsappVoipCallService.heartbeatActiveCall({
        wacid: parsedInput.wacid,
        workspaceId,
        userId: ctx.user.id,
      })
      return { ok }
    },
  )
