"use server"

import {
  canCallConversation,
  voipTurnCredentialService,
  whatsappVoipCallService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { whatsappCallRepository } from "@chatbotx.io/database/repositories"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { env } from "@/env"
import { callingActionClient } from "@/lib/safe-action"
import { CALL_ACCESS_DENIED_CODE } from "./assert-call-access"

/** Matches `assertCallAccessOrThrow`'s HTTP status for the same denial
 * reason — see `CALL_ACCESS_DENIED_CODE`'s doc comment. */
const CALL_ACCESS_DENIED_HTTP_STATUS = 403

const voipTurnCredentialsSchema = z.object({
  whatsappCallId: zodBigintAsString(),
})

/**
 * Short-lived STUN/TURN ICE servers for the browser's `RTCPeerConnection`,
 * scoped to the caller AND this specific call. Ring-all: while the call is
 * still UNCLAIMED any rung agent may mint ICE to prepare their answer (the
 * winner is decided later by `claimForAnswer`); once someone has claimed it,
 * only that agent may — a lost racer is refused. The coturn username embeds
 * both ids for log attribution — coturn checks only the HMAC and the expiry,
 * so a leaked credential is usable until it expires. Falls back to
 * STUN-only when no TURN secret is configured (local dev) — good enough on
 * NAT-friendly networks, never sufficient in production (see
 * `docs/whatsapp-calling-voip.md` "Required infrastructure").
 */
export const getWhatsappVoipTurnCredentialsAction = callingActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(voipTurnCredentialsSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [workspaceId], ctx }) => {
    const t = await getTranslations()
    const { whatsappCallId } = parsedInput

    const call = await whatsappCallRepository.findById(whatsappCallId)
    if (!call || call.workspaceId !== workspaceId || !call.wacid) {
      throw new ChatbotXException(t("whatsapp.calls.errors.callNotFound"))
    }

    const control = await whatsappVoipCallService.readControl(call.wacid)
    // Allowed while still ringing (reservedUserId "") for any rung agent, or
    // for the agent who has since claimed it; refused for a lost racer or when
    // there is no live call.
    if (
      !control ||
      (control.reservedUserId !== "" && control.reservedUserId !== ctx.user.id)
    ) {
      throw new ChatbotXException(
        t("whatsapp.calls.errors.voipNotReservedAgent"),
      )
    }

    // P2 item 5 (plan D3): reservation alone does not mean an agent is still
    // allowed to handle this conversation — `callingActionClient`'s
    // contacts-access gate is workspace-wide, not conversation-scoped, and an
    // onlyAssignedContacts agent can be reassigned away (or lose eligibility)
    // AFTER claiming the call. Always re-check, for both the still-unclaimed
    // (ring-all) case and the already-claimed case — a claimed-but-no-longer-
    // eligible agent must be refused here too, not just at claim time. Uses
    // the dedicated `voipCallAccessDenied` message (M1) rather than reusing
    // `voipNotReservedAgent` — a D3 eligibility denial is a different reason
    // than "someone else already claimed this call", and the two must not be
    // conflated in the UI.
    if (
      !(await canCallConversation({
        workspaceId,
        conversationId: call.conversationId,
        userId: ctx.user.id,
      }))
    ) {
      throw new ChatbotXException(
        t("whatsapp.calls.errors.voipCallAccessDenied"),
        CALL_ACCESS_DENIED_CODE,
        CALL_ACCESS_DENIED_HTTP_STATUS,
      )
    }

    return await voipTurnCredentialService.issueCredentials({
      userId: ctx.user.id,
      wacid: call.wacid,
      turnUrl: env.TURN_URL,
      turnStaticSecret: env.TURN_STATIC_SECRET,
    })
  })
