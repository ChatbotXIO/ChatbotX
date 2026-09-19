"use server"

import { voipTurnCredentialService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { distributedStore } from "@chatbotx.io/redis"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { env } from "@/env"
import { logger } from "@/lib/log"
import { callingActionClient } from "@/lib/safe-action"

/**
 * Bounds the client-minted pre-dial attempt identifier — never trusted beyond
 * an opaque string used to scope the TURN username.
 */
const MAX_ATTEMPT_ID_CHARS = 200

/**
 * Rate-limits credential minting per caller since this action runs before a
 * WhatsappCall row exists, so there is nothing else to gate abuse on.
 */
const TURN_MINT_WINDOW_SECONDS = 60
const TURN_MINT_LIMIT_PER_WINDOW = 10

type TurnMintRateLimitStore = Pick<typeof distributedStore, "incrWithWindow">

const buildTurnMintRateLimitKey = (userId: string, windowSuffix: string) =>
  ["outbound-voip-turn-mint-rate-limit", userId, windowSuffix].join(":")

const buildWindowSuffix = (now: number, windowSeconds: number) =>
  String(Math.floor(now / (windowSeconds * 1000)))

/**
 * Fails open on a store error (Redis unavailable) — a temporary outage
 * shouldn't block agents from placing calls; this guards against sustained
 * abuse, not a single missed window.
 */
async function assertTurnMintNotRateLimited(
  userId: string,
  store: TurnMintRateLimitStore = distributedStore,
  now: number = Date.now(),
): Promise<void> {
  const windowSuffix = buildWindowSuffix(now, TURN_MINT_WINDOW_SECONDS)
  const key = buildTurnMintRateLimitKey(userId, windowSuffix)

  let count: number
  try {
    count = await store.incrWithWindow(key, TURN_MINT_WINDOW_SECONDS)
  } catch (error) {
    logger.warn(
      { err: error, userId },
      "Outbound VoIP TURN mint rate limit store failed; allowing the mint",
    )
    return
  }

  if (count > TURN_MINT_LIMIT_PER_WINDOW) {
    const t = await getTranslations()
    throw new ChatbotXException(
      t("whatsapp.calls.errors.voipTurnCredentialsRateLimited"),
      "tooManyRequests",
      429,
    )
  }
}

const outboundVoipTurnCredentialsSchema = z.object({
  /** Client-minted per-attempt identifier, used before the call row (and its wacid) exist. */
  attemptId: z.string().min(1).max(MAX_ATTEMPT_ID_CHARS),
})

/**
 * Short-lived STUN/TURN ICE servers for the outbound dial's RTCPeerConnection,
 * minted before the WhatsappCall row exists, so this is gated only on
 * workspace membership rather than a call reservation.
 */
export const outboundVoipTurnCredentialsAction = callingActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(outboundVoipTurnCredentialsSchema)
  // The bound workspaceId is used only for the authorization gate — VoIP TURN
  // credentials are scoped to the caller, not the workspace, so it's
  // intentionally left unused here.
  .action(async ({ parsedInput, ctx }) => {
    const { attemptId } = parsedInput

    await assertTurnMintNotRateLimited(ctx.user.id)

    return await voipTurnCredentialService.issueCredentials({
      userId: ctx.user.id,
      wacid: attemptId,
      turnUrl: env.TURN_URL,
      turnStaticSecret: env.TURN_STATIC_SECRET,
    })
  })
