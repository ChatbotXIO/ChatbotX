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
 * Per-run cap on candidate rows. Each candidate costs a Redis read and, when
 * its call is still live, a Graph terminate — bounded to keep one backlogged
 * run from fanning out into an unbounded burst of outbound requests. The sweep
 * runs on a fixed schedule, so anything beyond one page drains on later runs.
 */
const STALE_RINGING_SWEEP_LIMIT = 200

/**
 * Ends a stale row via its Redis call-control record when one is still live (its own
 * expiry job never ran — worker crash, lost job, Redis flush), using the same
 * `endReservedCall` primitive so Meta and the agent's realtime dock both clear. No
 * control record, or a failed auth lookup, falls back to a direct terminal-status write.
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
 * Finalizes calls left `ringing` past `STALE_RINGING_THRESHOLD_MS`; `finalizeById`'s
 * status-rank guard makes the write a no-op if the row already progressed.
 * A call left `accepted` (terminate webhook lost) is deliberately NOT swept — "no
 * heartbeat" is never proof a call ended; see `whatsappVoipCallService.assertNoActiveCallForContact`.
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
