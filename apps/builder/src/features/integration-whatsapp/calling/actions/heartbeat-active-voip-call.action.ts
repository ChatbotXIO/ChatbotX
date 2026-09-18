"use server"

import { whatsappVoipCallService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceActionClient } from "@/lib/safe-action"

const heartbeatActiveVoipCallSchema = z.object({
  wacid: z.string().min(1),
})

/**
 * Liveness: the browser tab holding an `accepted` VoIP call calls this on
 * a short interval so a genuinely stranded call (the
 * terminate webhook was lost) can be told apart from one that is still live
 * but has run longer than the control's safety-net TTL — the distinction
 * `whatsappVoipCallService.assertNoActiveCallForContact` makes the next time
 * someone dials this contact. Nothing acts on it on a timer. Delegates
 * entirely to
 * `whatsappVoipCallService.heartbeatActiveCall`, which verifies the call
 * belongs to this workspace and that the live control is still
 * `phase:"accepted"` with `reservedUserId` matching the caller before
 * writing anything — a heartbeat for a call this agent doesn't own, or that
 * already ended, returns `{ ok: false }` rather than throwing.
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
