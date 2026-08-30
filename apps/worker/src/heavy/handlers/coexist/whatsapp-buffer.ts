import { createHash } from "node:crypto"
import { db } from "@chatbotx.io/database/client"
import { whatsappCoexistStagingModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import {
  HeavyJobAction,
  type HeavyJobCoexistWhatsappBuffer,
  heavyQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"

const hashPayload = (payload: unknown): string =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex")

// Coalesce burst webhooks into a single delayed flush. BullMQ jobId dedup
// drops subsequent webhooks within the delay window; the in-flight job
// drains everything staged so far in one pass.
const FLUSH_DELAY_MS = 60_000

/**
 * Buffers a raw WhatsApp Coexistence history payload into the staging table.
 *
 * Per-webhook overhead is intentionally minimal: stage the payload, then
 * enqueue a delayed flush keyed by phoneNumberId. The flush handler looks up
 * the live run on entry — buffer does not query CoexistSyncRun.
 *
 * Run rows are created by the popup-enable action (builder api/coexist.ts).
 */
export const coexistWhatsappBuffer = async (
  data: HeavyJobCoexistWhatsappBuffer["data"],
): Promise<void> => {
  const { phoneNumberId, payload } = data

  // Validate ownership BEFORE touching the staging table — otherwise a
  // spoofed or stale phoneNumberId would orphan rows that no flush can
  // ever drain (no integration row exists to gate them).
  const integration = await db.query.integrationWhatsappModel.findFirst({
    where: { phoneNumberId },
  })

  if (!integration) {
    logger.warn(
      { phoneNumberId },
      "[coexist] Dropped history payload for unknown WhatsApp integration",
    )
    return
  }

  // Idempotency: Meta retries webhook deliveries. (phoneNumberId, payloadHash)
  // is uniquely indexed, so duplicate deliveries collapse to one staging row.
  await db
    .insert(whatsappCoexistStagingModel)
    .values({
      id: createId(),
      phoneNumberId,
      payload,
      payloadHash: hashPayload(payload),
    })
    .onConflictDoNothing()

  // Only enqueue flush jobs when coexistEnabled — staging rows are always
  // persisted (to avoid data loss before the user enables coexist), but the
  // flush is only meaningful once the feature is active.
  if (!integration.coexistEnabled) {
    return
  }

  // Single coalesced flush keyed by phoneNumberId. Rows that arrive while this
  // job is already active are handled by the flush handler itself: after it
  // drains, it re-checks for unprocessed rows and self-enqueues one follow-up
  // (also coalesced) — see coexistWhatsappFlush. That keeps the queue free of
  // a per-webhook follow-up storm during a multi-hour history backfill.
  await heavyQueue.add(
    HeavyJobAction.coexistWhatsappFlush,
    {
      type: HeavyJobAction.coexistWhatsappFlush,
      data: { phoneNumberId },
    },
    {
      delay: FLUSH_DELAY_MS,
      jobId: `coexist-flush-${phoneNumberId}`,
    },
  )
}
