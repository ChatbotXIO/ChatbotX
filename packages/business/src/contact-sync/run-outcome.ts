import type { FinishContactSyncRunInput } from "@chatbotx.io/database/repositories"
import type {
  ContactSyncRunItemModel,
  ContactSyncRunModel,
} from "@chatbotx.io/database/types"

/**
 * A cancelled item (its page went away) is neutral: the run is judged on the
 * rest. A run left with nothing but cancelled items ends `cancelled`.
 */
export const settleRunOutcome = (
  status: ContactSyncRunModel["status"],
  itemStatuses: ContactSyncRunItemModel["status"][],
): FinishContactSyncRunInput => {
  if (status === "cancelling") {
    return { status: "cancelled" }
  }
  const judged = itemStatuses.filter((item) => item !== "cancelled")
  if (judged.length === 0) {
    return { status: "cancelled" }
  }
  const succeeded = judged.filter((item) => item === "succeeded").length
  if (succeeded === judged.length) {
    return { status: "succeeded" }
  }
  const anyProgress = succeeded > 0 || judged.some((item) => item === "partial")
  return { status: anyProgress ? "partial" : "failed" }
}
