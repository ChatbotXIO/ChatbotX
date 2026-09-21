export type EstimatedContactsDisplayState = "count" | "empty" | "loading"

const ESTIMATING_BROADCAST_STATUSES = new Set<string>(["scheduled", "sending"])

/** A broadcast the worker is still working on: its count and stats keep changing. */
export function isBroadcastInProgress(status: string): boolean {
  return ESTIMATING_BROADCAST_STATUSES.has(status)
}

export function getEstimatedContactsDisplayState(props: {
  contactCount: number | null
  status: string
}): EstimatedContactsDisplayState {
  if (props.contactCount !== null) {
    return "count"
  }

  return isBroadcastInProgress(props.status) ? "loading" : "empty"
}
