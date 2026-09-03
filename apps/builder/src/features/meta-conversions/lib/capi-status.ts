import { isAwaitingCapiScope } from "./capi-connection-state"

export type CapiStatus =
  | "ready"
  | "notConnected"
  | "missingPermission"
  | "unverified"
  | "unsupported"

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
  missingPermission: {
    labelKey: "metaConversions.status.missingPermission",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-500",
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
 *
 * A dataset that is already provisioned but has neither a manual access
 * token nor the Meta scope needed to send events is "missingPermission":
 * the integration is not silently treated as never-connected, it is one
 * reconnect-and-grant away from working.
 *
 * A user-intent disconnect wins over every readiness signal: the stored
 * dataset, token and scope may all still be present, but the integration
 * must read as "notConnected" — the same precedence `getCapiConnectionState`
 * applies when it falls back to the method chooser.
 */
export function getCapiStatus(input: {
  hasCapiScope: boolean
  hasManualCapiAccessToken?: boolean
  hasDatasetId?: boolean
  credentialAvailable: boolean
  supported?: boolean
  capiDisconnected?: boolean
}): CapiStatus {
  if (input.supported === false) {
    return "unsupported"
  }
  if (input.capiDisconnected) {
    return "notConnected"
  }
  if (input.hasManualCapiAccessToken && input.hasDatasetId) {
    return "ready"
  }
  if (input.hasCapiScope && input.hasDatasetId) {
    return "ready"
  }
  if (!input.credentialAvailable) {
    return "unverified"
  }
  if (isAwaitingCapiScope(input)) {
    return "missingPermission"
  }
  return "notConnected"
}
