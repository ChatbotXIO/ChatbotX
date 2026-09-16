"use server"

import { whatsappVoipPresenceService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

/**
 * Marks the current agent "available for VoIP calls" for the next presence TTL
 * — the builder calls this on a short interval while the inbox call dock is
 * mounted (see `useWhatsappVoipPresence`). This is the ONLY routing source for
 * inbound browser-WebRTC calls, so a number rings only agents with the inbox
 * open. No side effects beyond the
 * short-TTL Redis presence write.
 *
 * No-input action (`bindArgsSchemas` only, per AGENTS.md invariant #6) — the
 * client must call `execute` with no arguments, not `execute({})`.
 */
export const heartbeatVoipPresenceAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .action(async ({ bindArgsParsedInputs: [workspaceId], ctx }) => {
    await whatsappVoipPresenceService.heartbeat({
      workspaceId,
      userId: ctx.user.id,
    })
    return { ok: true }
  })
