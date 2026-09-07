import { randomUUID } from "node:crypto"

/**
 * Every BullMQ job id the Coexistence pipeline mints, in one place.
 *
 * A job id is reserved until the job is REMOVED, not until it finishes:
 * `addStandardJob` does a bare `EXISTS jobIdKey` regardless of state, so a
 * retained job silently swallows the next `add` with the same id. That makes
 * these ids production-critical rather than cosmetic, and worth owning
 * centrally instead of being spelled out at each producer.
 */

/**
 * Coalescing id for the buffer's delayed flush, one per phone number.
 *
 * The `-v2` generation is deliberate. Jobs enqueued under the
 * previous `coexist-flush-<phoneNumberId>` id were created before
 * `removeOnComplete: true` was set, so the integration worker's default
 * (`removeOnComplete: { count: 1000 }`) retained them — and a retained
 * COMPLETED job keeps its id reserved. Without a new generation, every number
 * that had flushed once before the deploy would have its 60s coalesced flush
 * silently dropped until 1000 newer completions evicted the old job. Bumping
 * the generation is the one-line rollout fix; never reuse a generation.
 */
export const buildCoexistFlushJobId = (phoneNumberId: string): string =>
  `coexist-flush-v2-${phoneNumberId}`

/**
 * Id for a run the scheduler enqueues. `attempts` is part of the id so a retry
 * of the same run is a distinct job.
 *
 * `suffix` disambiguates an enqueue that deliberately REUSES the current
 * attempts — see `buildCoexistReviveJobSuffix`.
 */
export const buildCoexistRunJobId = (input: {
  runId: string
  attempts: number
  suffix?: string
}): string =>
  `coexist-run-${input.runId}-${input.attempts}${input.suffix ?? ""}`

/**
 * Id for a run's continuation chunk: same run and attempts, next page. Used by
 * every paged coexist sync (the WhatsApp flush, the Instagram pull).
 */
export const buildCoexistPageJobId = (input: {
  runId: string
  attempts: number
  pageNumber: number
}): string =>
  `${buildCoexistRunJobId({ runId: input.runId, attempts: input.attempts })}-page-${input.pageNumber}`

/**
 * Suffix for a run lifted out of `waiting`. A revive reuses the run's CURRENT
 * attempts, so the plain run id may already belong to a retained FAILED job
 * (`removeOnFail: { count: 100 }`) and BullMQ would return that job instead of
 * enqueuing.
 *
 * `randomUUID()` rather than a process-local counter: two scheduler processes
 * restarted in the same millisecond would otherwise mint the same suffix.
 * The `-revive-` prefix is kept so the ids stay greppable.
 */
export const buildCoexistReviveJobSuffix = (): string =>
  `-revive-${randomUUID()}`
