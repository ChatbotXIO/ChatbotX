/**
 * BullMQ job id for one chunk of a Meta Business AI bulk run. A job id is
 * reserved until the job is REMOVED, so every dispatch needs its own: the
 * run's `chunkSeq` is bumped by each continuation and each sweeper re-dispatch,
 * which makes `(run, chunkSeq)` unique. The id is derived from the stored row
 * alone, so the sweeper can find the job of the dispatch before its own.
 * Colon-free: ids appear in Redis keys where `:` separates fields.
 */
export const buildAiHandoverBulkJobId = (input: {
  runId: string
  chunkSeq: number
}): string => `ai-handover-bulk-${input.runId}-chunk-${input.chunkSeq}`
