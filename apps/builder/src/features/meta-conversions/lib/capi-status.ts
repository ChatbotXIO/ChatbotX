export type CapiStatus = "ready" | "notConnected" | "unverified" | "unsupported"

export const capiStatusConfig = {
  ready: {
    labelKey: "metaConversions.status.ready",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClassName: "bg-emerald-500",
  },
  notConnected: {
    labelKey: "metaConversions.status.notConnected",
    className: "border-border bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground/60",
  },
  unverified: {
    labelKey: "metaConversions.status.unverified",
    className: "border-border bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground/60",
  },
  unsupported: {
    labelKey: "metaConversions.status.unsupported",
    className: "border-border bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground/60",
  },
} as const satisfies Record<
  CapiStatus,
  { labelKey: string; className: string; dotClassName: string }
>

/**
 * In the pick-a-method connect flow, "not connected" covers every
 * non-ready state (never connected, permission declined, or user
 * disconnect) — the chooser below is the call to action either way.
 */
export function getCapiStatus(input: {
  hasCapiScope: boolean
  hasManualCapiAccessToken?: boolean
  hasDatasetId?: boolean
  credentialAvailable: boolean
  supported?: boolean
}): CapiStatus {
  if (input.supported === false) {
    return "unsupported"
  }
  if (input.hasManualCapiAccessToken && input.hasDatasetId) {
    return "ready"
  }
  if (input.hasCapiScope && input.hasDatasetId) {
    return "ready"
  }
  if (input.credentialAvailable) {
    return "notConnected"
  }
  return "unverified"
}
