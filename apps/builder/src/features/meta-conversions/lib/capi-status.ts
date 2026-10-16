import type { CapiConnection } from "@chatbotx.io/business/meta-conversions/connection-state"

export type CapiStatus = "ready" | "reconnect" | "notConnected" | "unsupported"

export const capiStatusConfig = {
  ready: {
    labelKey: "metaConversions.status.ready",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClassName: "bg-emerald-500",
  },
  reconnect: {
    labelKey: "metaConversions.status.reconnect",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-500",
  },
  notConnected: {
    labelKey: "metaConversions.status.notConnected",
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

const statusByConnection = {
  connected: "ready",
  reconnect: "reconnect",
  notConnected: "notConnected",
} as const satisfies Record<CapiConnection, CapiStatus>

/**
 * The status shown for a stored connection. `unsupported` (an Instagram account
 * that cannot use the Conversions API) wins over whatever the row stores.
 */
export function getCapiStatus(input: {
  connection: CapiConnection
  supported?: boolean
}): CapiStatus {
  if (input.supported === false) {
    return "unsupported"
  }
  return statusByConnection[input.connection]
}
