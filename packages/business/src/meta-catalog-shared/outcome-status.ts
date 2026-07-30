/**
 * The verdict a finished Meta Catalog transfer ends on. A push and a pull count
 * different things but answer the same question — nothing moved is a failure,
 * some of what was attempted moved is partial — so the rule lives here instead
 * of each service keeping its own copy and drifting from the other.
 */
export const resolveMetaCatalogOutcome = ({
  succeededCount,
  failedCount,
  /**
   * Rows left alone on purpose, which still keep a run from being a clean
   * success. A pull has none: every product Meta returns is either imported or
   * counted as failed.
   */
  skippedCount = 0,
}: {
  succeededCount: number
  failedCount: number
  skippedCount?: number
}) => {
  if (failedCount === 0 && skippedCount === 0) {
    return "succeeded" as const
  }
  return succeededCount > 0 ? ("partial" as const) : ("failed" as const)
}
