import type { LogProviderErrorInput } from "@chatbotx.io/business/error-log"
import { logProviderErrors } from "@chatbotx.io/business/error-log"
import type {
  EventBusMessageMetadata,
  MessageFailedPayload,
  MessagePayload,
} from "@chatbotx.io/event-bus"
import {
  BROADCAST_PAYLOAD_TYPE,
  SEQUENCE_SCHEDULE_PAYLOAD_TYPE,
} from "@chatbotx.io/flow-config"
import { errorLogProviders } from "@chatbotx.io/utils/error-log"
import { logger } from "../../../lib/logger"

type FailedPayloadWithMetadata = MessageFailedPayload & EventBusMessageMetadata

/**
 * `errorData` is typed `z.unknown()` on `failedPayloadSchema`, so it is read
 * defensively rather than cast. Only the two fields this handler needs are
 * extracted.
 */
const readErrorData = (
  errorData: unknown,
): { isRetryable: boolean; statusCode?: number } => {
  if (typeof errorData !== "object" || errorData === null) {
    return { isRetryable: false }
  }
  const isRetryable = Reflect.get(errorData, "isRetryable")
  const statusCode = Reflect.get(errorData, "statusCode")
  return {
    // Absent means terminal: only an explicit `true` suppresses the row.
    isRetryable: isRetryable === true,
    statusCode: typeof statusCode === "number" ? statusCode : undefined,
  }
}

/**
 * Audience fan-out. One failing broadcast or sequence run emits one
 * `message:failed` per recipient, so a 50k-contact broadcast against an expired
 * token would write 50k rows and bury every other failure in the workspace's
 * feed. Broadcast and sequence analytics already report per-run failure counts,
 * and the emit site still logs to `logger.error`, so nothing becomes invisible.
 *
 * `metadata` rides the whole chain: the broadcast/sequence dispatchers stamp it
 * (`process-broadcast-contacts.ts`, `sequence-scheduler/worker-consumer.ts`),
 * `flow.ts` re-passes it into every downstream step and re-enqueue, and
 * `message-status.ts` copies it back off the stored message, so a provider's
 * async "failed" status for a bulk message is skipped too.
 */
const BULK_SEND_ORIGINS = new Set<string>([
  BROADCAST_PAYLOAD_TYPE,
  SEQUENCE_SCHEDULE_PAYLOAD_TYPE,
])

const isBulkSend = (payload: FailedPayloadWithMetadata): boolean =>
  BULK_SEND_ORIGINS.has(payload.metadata?.type ?? "")

const toEligibleFailure = (
  payload: FailedPayloadWithMetadata,
): { input: LogProviderErrorInput } | null => {
  // Cheapest test first, and the one that removes the most rows.
  if (isBulkSend(payload)) {
    return null
  }

  const { isRetryable, statusCode } = readErrorData(payload.errorData)
  // Terminal failures only — one row per logical failure, written on the
  // emission that ends the send.
  //
  // `willRetry` is authoritative wherever the emitter sets it, because only
  // the emitter knows what the worker is about to do: whether the BullMQ job
  // has attempts left, and whether `shouldSuppressRetryableChannelError` is
  // about to swallow the error instead of rethrowing it. That second case is
  // why `errorData.isRetryable` alone is not enough — a Messenger
  // `NETWORK_ERROR` is flagged retryable, is abandoned on its first attempt,
  // and would otherwise leave an undelivered message with no row at all.
  //
  // Emitters with no retry of their own (a provider's async delivery status)
  // leave it unset and fall back to the error's own retryability.
  if (payload.willRetry ?? isRetryable) {
    return null
  }

  // `context.channel` is a plain string on the event schema. An unknown
  // value gets no row rather than a fabricated provider.
  const provider = errorLogProviders.safeParse(payload.context.channel)
  if (!provider.success) {
    logger.warn(
      {
        channel: payload.context.channel,
        workspaceId: payload.context.workspaceId,
      },
      "recordProviderErrorLog: unmapped channel, skipping error log",
    )
    return null
  }

  return {
    input: {
      provider: provider.data,
      workspaceId: payload.context.workspaceId,
      contactId: payload.context.contactId,
      error: payload.errorData,
      httpCode: statusCode === undefined ? undefined : String(statusCode),
    },
  }
}

/**
 * Writes an `ErrorLog` row for every terminal outbound-channel failure.
 *
 * One registration here covers `sendMessageToChannel`, both template senders,
 * flow-step sends, and provider delivery-status callbacks — every site that
 * emits `message:failed`.
 *
 * Broadcast and sequence sends are excluded — see {@link BULK_SEND_ORIGINS}.
 *
 * Batches are up to `readBatchSize` (500) payloads and the stream is not acked
 * until this returns. The whole batch is handed to `logProviderErrors` in one
 * call so it becomes a handful of queue jobs rather than up to 500 — the
 * `default` queue runs at `concurrency: 5` and is shared with user-visible
 * work (exports, imports, template installs) that must not queue behind one
 * inbound burst's error logging.
 */
export async function recordProviderErrorLog(payloads: MessagePayload[]) {
  const eligible = (payloads as FailedPayloadWithMetadata[])
    .map(toEligibleFailure)
    .filter((failure) => failure !== null)

  if (eligible.length === 0) {
    return
  }

  // `logProviderErrors` never throws by contract; if that contract is ever
  // broken, treat the whole batch as unwritten rather than escalating.
  let failedIndexes: number[]
  try {
    const result = await logProviderErrors(eligible.map(({ input }) => input))
    failedIndexes = result.failedIndexes
  } catch {
    failedIndexes = eligible.map((_, index) => index)
  }

  if (failedIndexes.length === 0) {
    return
  }

  // Deliberately not returned as `{ failedMessageIds }`: `messageEventBus` runs
  // without `enableSelectiveRetry`, so `processAndAck` acks the whole batch
  // whatever this returns, and reporting ids here would look like a retry that
  // never happens. The emit already failed after its own timeout and retries,
  // so the loss is real — log it loudly enough to be alertable instead of
  // hiding it behind the bus's generic "acking batch despite handler failures"
  // warn. Turning selective retry on for this bus is not the fix: every other
  // message listener would start seeing redeliveries, and message sends are not
  // idempotent.
  logger.error(
    {
      count: failedIndexes.length,
      total: eligible.length,
      workspaceIds: [
        ...new Set(
          failedIndexes.map((index) => eligible[index]?.input.workspaceId),
        ),
      ],
    },
    "recordProviderErrorLog: error logs dropped, emit failed and this bus cannot retry",
  )
}
