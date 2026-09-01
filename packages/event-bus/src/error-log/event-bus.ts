import {
  type BaseEventListener,
  type ErrorLogEventMap,
  type ErrorLogRecordedPayload,
  errorLogEventSchemas,
} from "@chatbotx.io/flow-config"
import { getRedisConnection } from "@chatbotx.io/worker-config"
import { BaseEventBus } from "../event-bus"

/**
 * Sized from a byte budget, not copied from another bus. `XDEL` is deliberately
 * omitted from the consume loop so several consumer groups can read one stream,
 * which means acked entries live until `MAXLEN` evicts them — unlike the BullMQ
 * job this replaced, which kept only 1000 completed jobs.
 *
 * Error-log payloads are the largest of any stream here by construction: a
 * `detail` is truncated at 8KB, so 50k entries is a ~400MB worst case and far
 * more than any plausible replay window. The dashboard bus's 500k would be 4GB.
 */
const MAX_ERROR_LOG_EVENTS = 50_000
const MAX_ERROR_LOG_DLQ_EVENTS = 10_000

export const errorLogEventBus = new BaseEventBus<
  ErrorLogEventMap,
  BaseEventListener<ErrorLogRecordedPayload>
>(() => getRedisConnection(), {
  streamKey: "events:error-log",
  consumerGroup: "error-log-events-group",
  deadLetterMaxLen: MAX_ERROR_LOG_DLQ_EVENTS,
  deadLetterStreamKey: "events:error-log:dead",
  // Writes are idempotent on the row id the producer mints, so a redelivery
  // cannot duplicate. That makes per-message retry safe, and it is what
  // replaces the BullMQ `attempts: 2` this path used to get.
  enableSelectiveRetry: true,
  maxLen: MAX_ERROR_LOG_EVENTS,
  maxDeliveries: 5,
  schemas: errorLogEventSchemas,
})
