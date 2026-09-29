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

/**
 * Matches assertCallAccessOrThrow's HTTP status for the same denial reason -
 * see CALL_ACCESS_DENIED_CODE's doc comment.
 */
const CALL_ACCESS_DENIED_HTTP_STATUS = 403

const voipTurnCredentialsSchema = z.object({
  whatsappCallId: zodBigintAsString(),
})

/**
 * Short-lived STUN/TURN ICE credentials, scoped to caller + call. Ring-all:
 * any rung agent may mint ICE while unclaimed; once claimed only the winner
 * may (a lost racer is refused). coturn checks only HMAC + expiry, so a
 * leaked credential works until it expires. Falls back to STUN-only when no
 * TURN secret is configured (local dev only).
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

    // Reservation alone isn't enough: the contacts-access gate is
    // workspace-wide, and an onlyAssignedContacts agent can lose eligibility
    // after claiming. Re-check always; use voipCallAccessDenied (not
    // voipNotReservedAgent) since it's a distinct denial reason.
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
