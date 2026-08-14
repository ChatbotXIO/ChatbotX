export type CapiConnectionState =
  | "connectedCustom"
  | "connectedOauth"
  | "disconnected"

/**
 * Derives the connection state shown by the CAPI tab. A user-intent
 * disconnect (capiDisconnected) overrides everything — the Meta-side scope
 * may still be granted, but the integration must render as disconnected.
 *
 * A workspace with OAuth scope but no dataset yet is still "disconnected"
 * (the chooser is shown): the method chooser's "Connect via Facebook" step
 * owns the dataset-finalize sub-flow, so there is no separate top-level
 * awaiting-dataset state.
 */
export function getCapiConnectionState(input: {
  capiDisconnected: boolean
  hasManualCapiAccessToken: boolean
  hasCapiScope: boolean
  hasDatasetId: boolean
}): CapiConnectionState {
  if (input.capiDisconnected) {
    return "disconnected"
  }
  if (input.hasManualCapiAccessToken && input.hasDatasetId) {
    return "connectedCustom"
  }
  if (input.hasCapiScope && input.hasDatasetId) {
    return "connectedOauth"
  }
  return "disconnected"
}
