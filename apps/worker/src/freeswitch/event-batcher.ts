import {
  IntegrationJobAction,
  type IntegrationJobWhatsappFreeswitchEvent,
} from "@chatbotx.io/worker-config"
import type { KeptFreeswitchEvent } from "./keep-rule"

const DEFAULT_MAX_BATCH_SIZE = 200
const DEFAULT_FLUSH_INTERVAL_MS = 100

export type BatchedFreeswitchJob = {
  name: string
  data: IntegrationJobWhatsappFreeswitchEvent
  opts: { jobId: string }
}

export type AddBulkFn = (jobs: BatchedFreeswitchJob[]) => Promise<unknown>

/** `fs-<Unique-ID>-<event|subclass>` — stable across a redelivery of the same channel event. */
export const freeswitchJobId = (uuid: string, event: string): string =>
  `fs-${uuid}-${event}`

/**
 * In-memory batcher for the ESL socket callback: the callback
 * itself never awaits (`push` is synchronous), so the ESL socket can never
 * back-pressure on Redis. Flushes on `maxBatchSize` events OR every
 * `flushIntervalMs`, whichever comes first — bounded well below FreeSWITCH's
 * `MAX_QUEUE_LEN`/`MAX_MISSED` limits.
 */
export type FreeswitchEventBatcherOptions = {
  maxBatchSize?: number
  flushIntervalMs?: number
  /**
   * Upper bound on events retained across failed flushes (Redis outage).
   * Beyond it the OLDEST events are dropped and reported through
   * `onFlushError` — the reconciliation loop is the backstop for those.
   */
  maxBufferedEvents?: number
  onFlushError?: (error: unknown, droppedEvents: number) => void
}

const DEFAULT_MAX_BUFFERED_EVENTS = 10_000
const MAX_RETRY_BACKOFF_MULTIPLIER = 64

export class FreeswitchEventBatcher {
  private buffer: BatchedFreeswitchJob[] = []
  private timer: ReturnType<typeof setTimeout> | undefined
  private consecutiveFailures = 0
  private readonly nodeId: string
  private readonly addBulk: AddBulkFn
  private readonly maxBatchSize: number
  private readonly flushIntervalMs: number
  private readonly maxBufferedEvents: number
  private readonly onFlushError: FreeswitchEventBatcherOptions["onFlushError"]

  constructor(
    nodeId: string,
    addBulk: AddBulkFn,
    options: FreeswitchEventBatcherOptions = {},
  ) {
    this.nodeId = nodeId
    this.addBulk = addBulk
    this.maxBatchSize = options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS
    this.maxBufferedEvents =
      options.maxBufferedEvents ?? DEFAULT_MAX_BUFFERED_EVENTS
    this.onFlushError = options.onFlushError
  }

  /** Events currently held (including any batch waiting for a retry). */
  get pendingCount(): number {
    return this.buffer.length
  }

  push(event: KeptFreeswitchEvent): void {
    // Admission control: the cap holds at ALL times (including while an
    // `addBulk` is in flight or hung), not only after a rejected flush —
    // otherwise a stalled Redis call would let the buffer grow unbounded.
    if (this.buffer.length >= this.maxBufferedEvents) {
      this.buffer.shift()
      this.onFlushError?.(new Error("freeswitch-event-buffer-overflow"), 1)
    }
    this.buffer.push({
      name: "whatsappFreeswitchEvent",
      data: {
        type: IntegrationJobAction.whatsappFreeswitchEvent,
        data: {
          nodeId: this.nodeId,
          workspaceId: event.workspaceId,
          integrationId: event.integrationId,
          uuid: event.uuid,
          event: event.event,
          vars: event.vars,
        },
      },
      opts: { jobId: freeswitchJobId(event.uuid, event.event) },
    })

    if (
      this.buffer.length >= this.maxBatchSize &&
      this.consecutiveFailures === 0
    ) {
      // Fire-and-forget on purpose: `push` must stay synchronous so the ESL
      // event callback never awaits. A failed flush keeps its
      // events (see `flush`) and retries with backoff, so nothing is lost
      // to a transient Redis error; only a sustained outage past
      // `maxBufferedEvents` drops (oldest first, reported).
      this.flush().catch(() => undefined)
      return
    }
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.timer) {
      return
    }
    const backoff = Math.min(
      2 ** this.consecutiveFailures,
      MAX_RETRY_BACKOFF_MULTIPLIER,
    )
    this.timer = setTimeout(() => {
      this.flush().catch(() => undefined)
    }, this.flushIntervalMs * backoff)
  }

  /**
   * Enqueues everything buffered. On failure the batch is put BACK at the
   * front of the buffer (deterministic jobIds make a later re-add a no-op
   * for anything that did land) and a retry is scheduled with exponential
   * backoff; the buffer is capped at `maxBufferedEvents`.
   */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    if (this.inFlight) {
      // One enqueue at a time: events keep accumulating (bounded by
      // `push`'s admission control) and go out with the next flush.
      return await this.inFlight
    }
    if (this.buffer.length === 0) {
      return
    }
    this.inFlight = this.flushOnce().finally(() => {
      this.inFlight = undefined
    })
    return await this.inFlight
  }

  private inFlight: Promise<void> | undefined

  private async flushOnce(): Promise<void> {
    const batch = this.buffer.splice(0, this.maxBatchSize)
    try {
      await this.addBulk(batch)
      this.consecutiveFailures = 0
    } catch (error) {
      this.consecutiveFailures += 1
      this.buffer = [...batch, ...this.buffer]
      const overflow = this.buffer.length - this.maxBufferedEvents
      if (overflow > 0) {
        this.buffer = this.buffer.slice(overflow)
      }
      this.onFlushError?.(error, Math.max(0, overflow))
      this.scheduleFlush()
      throw error
    }
    if (this.buffer.length > 0) {
      this.scheduleFlush()
    }
  }

  /** Graceful shutdown: flush whatever is left, then stop. */
  async close(): Promise<void> {
    await this.flush()
  }
}
