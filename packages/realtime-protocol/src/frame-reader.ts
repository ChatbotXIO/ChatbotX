import type { z } from "zod"
import { isRealtimeSeqAfter } from "./stream"

type BatchFrame<TEnvelope> = { batch: TEnvelope[]; seq: string }

export type RealtimeFrameReader<TEnvelope> = {
  /** The `seq` of the last frame `readFrame` accepted (advanced its cursor
   * on), or `null` before the first one — a caller that needs to tell a
   * reconnecting server where it left off (e.g. the workspace socket's
   * `lastSeq` query param) reads this instead of re-tracking `seq` itself. */
  getLastSeq: () => string | null
  /**
   * Parses one wire frame. Returns the batch's envelope array (already
   * deduped/advanced against this reader's own `seq` cursor) for the caller
   * to dispatch, or `null` when there's nothing to dispatch: a heartbeat, a
   * frame that failed `JSON.parse`, a frame that failed `schema` validation
   * (also throttled-resyncs — see `resyncThrottleMs`), or a stale/duplicate
   * `seq` already seen.
   */
  readFrame: (data: string) => TEnvelope[] | null
  /**
   * Signals a validation failure the caller found AFTER `readFrame` already
   * returned a batch — e.g. one event's own `data` failed its event-specific
   * schema. Funnels into the exact same throttled resync signal as an
   * invalid batch envelope, so a burst of either kind of failure never fires
   * `onResyncNeeded` more than once per `resyncThrottleMs`.
   */
  reportInvalidEvent: () => void
  /** Clears the `seq` cursor — call on a fresh connection (new socket, or
   * after a resync) so the next frame is never mistaken for a stale dupe. */
  reset: () => void
}

/**
 * Shared "parse a realtime batch wire frame" logic for both realtime
 * clients (the workspace provider and the webchat guest client): JSON
 * parse, heartbeat filtering, batch-envelope schema validation, and `seq`
 * dedup/staleness checks are identical between them — only the envelope
 * schema (route-required for workspace delivery, route-less for guest
 * delivery — see `realtimeBatchEnvelopeSchema` vs
 * `realtimeGuestBatchEnvelopeSchema`) and the per-event dispatch differ,
 * which stay the caller's own responsibility. See PR #1349 round-5 (shared
 * frame reader) and round-4 (invalid batches/events must still force a
 * resync, now throttled so a burst of either can't storm `onResyncNeeded`).
 */
export const createRealtimeFrameReader = <TEnvelope>({
  onParseError,
  onResyncNeeded,
  resyncThrottleMs = 2000,
  schema,
}: {
  /** Called with the raw parse/validation error for every malformed-JSON or
   * schema-invalid frame — diagnostic only; throttling `onResyncNeeded` is
   * handled internally regardless of how often this fires. */
  onParseError: (error: unknown) => void
  onResyncNeeded: () => void
  /** Overridable only for tests — production always uses the default. */
  resyncThrottleMs?: number
  schema: z.ZodType<BatchFrame<TEnvelope>>
}): RealtimeFrameReader<TEnvelope> => {
  let lastSeq: string | null = null
  let lastResyncAt = 0

  const triggerResync = (): void => {
    const now = Date.now()
    if (now - lastResyncAt < resyncThrottleMs) {
      return
    }
    lastResyncAt = now
    onResyncNeeded()
  }

  return {
    getLastSeq: () => lastSeq,
    readFrame: (data) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(data)
      } catch (error) {
        onParseError(error)
        return null
      }
      if (parsed && typeof parsed === "object" && "hb" in parsed) {
        return null
      }
      const result = schema.safeParse(parsed)
      if (!result.success) {
        onParseError(result.error)
        triggerResync()
        return null
      }
      const { batch, seq } = result.data
      if (lastSeq && !isRealtimeSeqAfter(seq, lastSeq)) {
        return null
      }
      lastSeq = seq
      return batch
    },
    reportInvalidEvent: triggerResync,
    reset: () => {
      lastSeq = null
    },
  }
}
