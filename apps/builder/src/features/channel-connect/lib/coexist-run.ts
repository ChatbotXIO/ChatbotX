/** One target's outcome from the sequential coexist POST loop in `CoexistStep`. */
export type CoexistRowResult =
  | { status: "done" }
  | { status: "error"; text: string }

export type CoexistRunSummary = "enabled" | "disabled" | "none"

/**
 * The success-toast rule for a finished coexist run: never claim success when
 * nothing actually succeeded ("none"). When every target was left OFF, only
 * report "disabled" if every post actually succeeded — a partial failure
 * there already gets its own per-row error toast, and must never be papered
 * over with the "enabled" copy (nothing was enabled). Once at least one
 * target is ON, any success at all is reported as "enabled", even if another
 * row's post failed.
 */
export function summarizeCoexistRun(
  results: readonly CoexistRowResult[],
  { anyEnabled }: { anyEnabled: boolean },
): CoexistRunSummary {
  const succeededCount = results.filter(
    (result) => result.status === "done",
  ).length
  if (succeededCount === 0) {
    return "none"
  }
  if (!anyEnabled) {
    const allSucceeded = results.every((result) => result.status === "done")
    return allSucceeded ? "disabled" : "none"
  }
  return "enabled"
}
