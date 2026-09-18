import { whatsappVoipCallService } from "@chatbotx.io/business"
import { resolveWhatsappCallOutcome } from "@chatbotx.io/database/partials"
import { whatsappCallRepository } from "@chatbotx.io/database/repositories"
import type { WhatsappCallModel } from "@chatbotx.io/database/types"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  endReservedCall,
  resolveVoipAuthByInboxId,
} from "../../integration/handlers/whatsapp-voip-signaling"

const log = getChildLogger("sweep-stale-whatsapp-calls")

/** A call still `ringing` this long after it was placed was never finalized. */
const STALE_RINGING_THRESHOLD_MS = 90_000

/**
 * Per-run cap on candidate rows. Each candidate costs a Redis read and,
 * when its call is still live, a Graph terminate — so the page is bounded
 * to keep one backlogged run from fanning out into an unbounded burst of
 * outbound requests. The sweep runs on a fixed schedule, so anything beyond
 * one page drains on the following runs.
 */
const STALE_RINGING_SWEEP_LIMIT = 200

/**
 * Ends a stale row through its Redis call-control record when one is still
 * live, and reports whether it did.
 *
 * A live control means the call really is still up and its own expiry job
 * never ran (a worker crash, a lost job, a Redis flush). Ending it through
 * the same `endReservedCall` primitive the expiry jobs use terminates the
 * call at Meta and clears the agent's dock via the realtime "ended" event —
 * neither of which a bare status write would do. No control record means
 * the call is already over as far as signaling is concerned, and the caller
 * falls back to writing the terminal status directly.
 *
 * Resolving the Graph auth can fail (a missing integration row) without
 * aborting the whole sweep: it is logged and left to the same fallback.
 */
const endViaCallControlIfLive = async (
  call: Pick<WhatsappCallModel, "id" | "wacid" | "inboxId">,
): Promise<boolean> => {
  if (!call.wacid) {
    return false
  }
  try {
    const auth = await resolveVoipAuthByInboxId(call.inboxId)
    return await endReservedCall({ wacid: call.wacid, auth })
  } catch (err) {
    log.warn(
      { err, callId: call.id, wacid: call.wacid },
      "Whatsapp call stale sweep: unable to resolve auth/end the call via its control record; falling back to a direct finalize",
    )
    return false
  }
}

/**
 * Finalizes calls left `ringing` past {@link STALE_RINGING_THRESHOLD_MS}.
 * A call that is still live is ended properly via
 * {@link endViaCallControlIfLive}; anything else is written straight to
 * `failed`, where `finalizeById`'s status-rank guard makes the write a no-op
 * for a row that has meanwhile progressed on its own.
 *
 * A call left `accepted` (its terminate webhook lost) is deliberately NOT
 * swept: "no heartbeat" is never proof a call ended, so nothing closes one on
 * a timer. Such a row is recovered the next time an agent dials that contact —
 * see `whatsappVoipCallService.assertNoActiveCallForContact`.
 */
export async function sweepStaleWhatsappCalls(): Promise<void> {
  const stale = await whatsappCallRepository.sweepStaleRinging({
    olderThan: new Date(Date.now() - STALE_RINGING_THRESHOLD_MS),
    limit: STALE_RINGING_SWEEP_LIMIT,
  })

  let finalized = 0
  for (const call of stale) {
    if (await endViaCallControlIfLive(call)) {
      finalized++
      continue
    }

    const updated = await whatsappVoipCallService.finalizeEndedCall({
      whatsappCallId: call.id,
      status: "failed",
      outcome: resolveWhatsappCallOutcome({ status: "failed" }),
      endedAt: new Date(),
      lastError: "stale-ringing-never-finalized",
      current: call,
    })
    if (updated) {
      finalized++
    }
  }

  if (finalized > 0) {
    log.info({ finalized }, "Finalized stale ringing WhatsApp calls")
  }
}
