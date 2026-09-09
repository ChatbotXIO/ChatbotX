/**
 * BullMQ job ids for the Automatic Customer Scan pipeline, mirroring
 * `coexist-job-ids.ts`'s id-builder pattern.
 *
 * A job id is reserved until the job is REMOVED, not until it finishes:
 * `addStandardJob` does a bare `EXISTS jobIdKey` regardless of state, so a
 * retained job silently swallows the next `add` with the same id. These
 * builders keep ids deterministic and colon-free (job ids appear in BullMQ
 * Redis keys, where `:` is a field separator).
 */

/**
 * Id for a run the scheduler enqueues. `attempts` is part of the id so a
 * retry of the same run is a distinct job.
 */
export const buildContactScanJobId = (input: {
  runId: string
  attempts: number
}): string => `contact-scan-${input.runId}-${input.attempts}`

/**
 * Id for a run's continuation chunk: same run and attempts, next page.
 */
export const buildContactScanPageJobId = (input: {
  runId: string
  attempts: number
  pageNumber: number
}): string =>
  `${buildContactScanJobId({ runId: input.runId, attempts: input.attempts })}-page-${input.pageNumber}`
