"use server"

import {
  voipTurnCredentialService,
  whatsappVoipCallService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { whatsappCallRepository } from "@chatbotx.io/database/repositories"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { env } from "@/env"
import { workspaceActionClient } from "@/lib/safe-action"

const voipTurnCredentialsSchema = z.object({
  whatsappCallId: zodBigintAsString(),
})

/**
 * Short-lived STUN/TURN ICE servers for the browser's `RTCPeerConnection`,
 * scoped to the caller AND this specific call. Ring-all: while the call is
 * still UNCLAIMED any rung agent may mint ICE to prepare their answer (the
 * winner is decided later by `claimForAnswer`); once someone has claimed it,
 * only that agent may — a lost racer is refused. The coturn username embeds
 * both ids so a leaked credential cannot be replayed elsewhere. Falls back to
 * STUN-only when no TURN secret is configured (local dev) — good enough on
 * NAT-friendly networks, never sufficient in production (see
 * `docs/whatsapp-calling-voip.md` "Required infrastructure").
 */
export const getWhatsappVoipTurnCredentialsAction = workspaceActionClient
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

    return await voipTurnCredentialService.issueCredentials({
      userId: ctx.user.id,
      wacid: call.wacid,
      turnUrl: env.TURN_URL,
      turnStaticSecret: env.TURN_STATIC_SECRET,
    })
  })
