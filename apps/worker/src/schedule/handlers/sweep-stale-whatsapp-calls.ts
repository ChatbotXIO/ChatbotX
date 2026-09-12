import { whatsappCallRepository } from "@chatbotx.io/database/repositories"
import { getChildLogger } from "@chatbotx.io/logger"

const log = getChildLogger("sweep-stale-whatsapp-calls")

/** Outbound dial failed silently, or a lost `cbx::call`. */
const STALE_RINGING_THRESHOLD_MS = 90_000

/**
 * Every 5 minutes: `ringing` rows that never got a FreeSWITCH
 * uuid within 90s are finalized `failed` — `finalizeById`'s status-rank
 * guard makes this a no-op for a row that already progressed.
 */
export async function sweepStaleWhatsappCalls(): Promise<void> {
  const stale = await whatsappCallRepository.sweepStaleRinging({
    olderThan: new Date(Date.now() - STALE_RINGING_THRESHOLD_MS),
  })

  let finalized = 0
  for (const call of stale) {
    if (call.freeswitchUuid) {
      // Got a uuid after the query ran; a lifecycle event will finalize it.
      continue
    }
    const updated = await whatsappCallRepository.finalizeById({
      id: call.id,
      status: "failed",
      endedAt: new Date(),
      lastError: "stale-ringing-no-freeswitch-uuid",
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
