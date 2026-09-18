"use server"

import { whatsappVoipCallService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { callingActionClient } from "@/lib/safe-action"

/**
 * Resume-after-refresh lookup for VoIP calls: each inbound ring is delivered once
 * over realtime (fire-and-forget), so an agent who hits F5 mid-ring loses the
 * incoming-call UI even though the Redis offer/control TTL (~55s) may still make it
 * answerable. Called once on mount (see `useWhatsappVoipCall`) to re-show every
 * still-ringing, still-unclaimed call. Returns `[]`, never `null`.
 *
 * No-input action (`bindArgsSchemas` only, per AGENTS.md invariant #6) — the
 * client must call `execute` with no arguments, not `execute({})`.
 */
export const getPendingIncomingVoipCallAction = callingActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .action(async ({ bindArgsParsedInputs: [workspaceId], ctx }) =>
    whatsappVoipCallService.listResumableIncoming({
      workspaceId,
      userId: ctx.user.id,
    }),
  )
