import type { CapiConnection } from "@chatbotx.io/business/meta-conversions/connection-state"

export type CapiStatus = "ready" | "notConnected" | "unsupported"

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
 * A dedicated connect stores a token and its dataset together, so there is no
 * permission to verify: an integration is either connected or it is not.
 * `unsupported` (an Instagram account that cannot use the Conversions API) wins
 * over whatever the row stores.
 */
export function getCapiStatus(input: {
  connection: CapiConnection
  supported?: boolean
}): CapiStatus {
  if (input.supported === false) {
    return "unsupported"
  }
  return input.connection === "connected" ? "ready" : "notConnected"
}
