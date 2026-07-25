export type EstimatedContactsDisplayState = "count" | "empty" | "loading"

const ESTIMATING_BROADCAST_STATUSES = new Set<string>(["scheduled", "sending"])

export function getEstimatedContactsDisplayState(props: {
  contactCount: number | null
  status: string
}): EstimatedContactsDisplayState {
  if (props.contactCount !== null) {
    return "count"
  }

  return ESTIMATING_BROADCAST_STATUSES.has(props.status) ? "loading" : "empty"
}
