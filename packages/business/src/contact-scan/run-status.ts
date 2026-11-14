import type { ContactScanRunStatus } from "@chatbotx.io/database/partials"
import type { CoexistSyncRunModel } from "@chatbotx.io/database/types"
import { CONTACT_SCAN_ERRORS } from "./constants"

type RunForStatus = Pick<CoexistSyncRunModel, "status" | "currentError">

/**
 * The status a scan run is shown as, in one place for the latest-status view
 * and the history list so they cannot disagree. A cancelled scan is stored as
 * `partial` + the cancel sentinel; `waiting` (WhatsApp coexist only) can never
 * occur on a scan and is treated as still running, like the availability rules.
 */
export const resolveContactScanRunStatus = (
  run: RunForStatus,
): ContactScanRunStatus => {
  if (
    run.status === "partial" &&
    run.currentError === CONTACT_SCAN_ERRORS.cancelled
  ) {
    return "cancelled"
  }
  if (run.status === "waiting") {
    return "running"
  }
  return run.status
}
