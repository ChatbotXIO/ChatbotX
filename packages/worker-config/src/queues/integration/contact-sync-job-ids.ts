/**
 * BullMQ job id for one chunk of a contact sync run. A job id is reserved
 * until the job is REMOVED, so every dispatch needs its own: the run's
 * `chunkSeq` is bumped by each continuation and each sweeper re-dispatch,
 * which makes `(run, chunkSeq)` unique. Derived from the stored row alone, so
 * the sweeper can find the job of the dispatch before its own. Colon-free.
 */
export const buildContactSyncJobId = (input: {
  runId: string
  chunkSeq: number
}): string => `contact-sync-${input.runId}-chunk-${input.chunkSeq}`
