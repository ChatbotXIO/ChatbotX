"use server"

import { whatsappVoipCallService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { callingActionClient } from "@/lib/safe-action"

/**
 * Resume-after-refresh lookup for VoIP calls: ring-all means more than one
 * caller can be ringing this workspace at once, and each inbound ring is
 * delivered once over realtime (fire-and-forget to open sockets), so an
 * agent who hits F5 while calls are still ringing loses the incoming-call UI
 * for all of them even though the Redis offer/control TTL (~55s) means they
 * may still be answerable. The builder calls this once on mount (see
 * `useWhatsappVoipCall`) to re-discover every still-ringing, still-unclaimed
 * VoIP call for the workspace and re-show them. Returns `[]`, never `null`,
 * when there is nothing to resume.
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
