import {
  BROADCAST_PAYLOAD_TYPE,
  SEQUENCE_SCHEDULE_PAYLOAD_TYPE,
} from "@chatbotx.io/flow-config"

/**
 * Audience fan-out. One failing broadcast or sequence run produces one failure
 * per recipient, so anything that writes an `ErrorLog` row for it would write
 * one per contact (50k for a 50k-contact broadcast) and bury every other
 * failure in the workspace's feed. Broadcast and sequence analytics already
 * report per-run failure counts, and the emit site still logs to
 * `logger.error`, so nothing becomes invisible.
 *
 * `metadata` rides the whole chain: the broadcast/sequence dispatchers stamp it
 * (`process-broadcast-contacts.ts`, `sequence-scheduler/worker-consumer.ts`),
 * `flow.ts` re-passes it into every downstream step and re-enqueue, and
 * `message-status.ts` copies it back off the stored message.
 */
const BULK_SEND_ORIGINS = new Set<string>([
  BROADCAST_PAYLOAD_TYPE,
  SEQUENCE_SCHEDULE_PAYLOAD_TYPE,
])

export const isBulkSendOrigin = (
  metadata: { type?: string } | null | undefined,
): boolean => BULK_SEND_ORIGINS.has(metadata?.type ?? "")
