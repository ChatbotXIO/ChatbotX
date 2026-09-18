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
 * Bounds the client-minted pre-dial attempt identifier — never trusted
 * beyond an opaque string used to scope the TURN username (see
 * `outboundVoipTurnCredentialsAction`).
 */
const MAX_ATTEMPT_ID_CHARS = 200

/**
 * Rate-limit window for minting ephemeral TURN credentials, keyed per caller
 * — this action has no call row or reservation to gate on (it runs BEFORE a
 * `WhatsappCall` exists), so without a limit any workspace member can mint
 * unlimited short-lived relay credentials with no call ever placed. A leaked
 * one is a valid 10-minute TURN relay credential, so this bounds the blast
 * radius of relay-bandwidth abuse rather than trying to prevent it outright.
 * Reuses the same fixed-window `incrWithWindow` primitive as
 * `api-rate-limit.ts`/`guest-rate-limit.ts`.
 */
const TURN_MINT_WINDOW_SECONDS = 60
const TURN_MINT_LIMIT_PER_WINDOW = 10

type TurnMintRateLimitStore = Pick<typeof distributedStore, "incrWithWindow">

const buildTurnMintRateLimitKey = (userId: string, windowSuffix: string) =>
  ["outbound-voip-turn-mint-rate-limit", userId, windowSuffix].join(":")

const buildWindowSuffix = (now: number, windowSeconds: number) =>
  String(Math.floor(now / (windowSeconds * 1000)))

/**
 * Fails OPEN on a store error (Redis unavailable) — a temporary outage
 * should not block agents from placing calls; the risk this guards against
 * is sustained abuse, not a single missed window.
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
  /**
   * A client-minted, per-attempt identifier (e.g. a fresh `crypto.
   * randomUUID`) — NOT the same as `initiateOutboundVoipCallAction`'s
   * server-generated `attemptId`/`wacid`, because this action runs BEFORE
   * that call row exists (the browser must `createOffer`/gather ICE before
   * dialing). Only used to scope the minted TURN credential's username so a
   * leaked one is usable until it expires — the label only aids log tracing.
   */
  attemptId: z.string().min(1).max(MAX_ATTEMPT_ID_CHARS),
})

/**
 * Short-lived STUN/TURN ICE servers for the OUTBOUND (business-initiated)
 * VoIP dial's `RTCPeerConnection`, minted BEFORE the `WhatsappCall` row (and
 * `wacid`) exist — the browser must `createOffer` and gather ICE candidates
 * first, then pass the resulting SDP offer to `initiateOutboundVoipCallAction`.
 * Unlike `getWhatsappVoipTurnCredentialsAction` (inbound), this is gated
 * only on workspace membership — there is no call row or reservation to
 * check yet, so no `wacid`/`reservedUserId` gate applies. Scoped to
 * `<userId>:<attemptId>` to aid log tracing; a leaked credential still works for a
 * different agent or a different prepared call. Falls back to STUN-only
 * when no TURN secret is configured (see `voip-turn-credentials.action.ts`).
 */
export const outboundVoipTurnCredentialsAction = callingActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(outboundVoipTurnCredentialsSchema)
  // The bound workspaceId is used only for the authorization gate on this
  // action; VoIP TURN credentials are scoped to the caller, not the
  // workspace, so it is intentionally left unused here.
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
