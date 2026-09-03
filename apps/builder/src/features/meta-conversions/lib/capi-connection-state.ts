export type CapiConnectionState =
  | "connectedCustom"
  | "connectedOauth"
  | "awaitingScope"
  | "disconnected"

/**
 * A dataset already provisioned but with neither a manual token nor the
 * Meta scope needed to send events: one reconnect-and-grant away from
 * working, and the dataset id must stay visible meanwhile.
 */
export const isAwaitingCapiScope = (input: {
  hasDatasetId?: boolean
  hasManualCapiAccessToken?: boolean
  hasCapiScope: boolean
}): boolean =>
  Boolean(input.hasDatasetId) &&
  !input.hasManualCapiAccessToken &&
  !input.hasCapiScope

/**
 * Derives the connection state shown by the CAPI tab. A user-intent
 * disconnect (capiDisconnected) overrides everything — the Meta-side scope
 * may still be granted, but the integration must render as disconnected.
 *
 * A workspace with OAuth scope but no dataset yet is still "disconnected"
 * (the chooser is shown): the method chooser's "Connect via Facebook" step
 * owns the dataset-finalize sub-flow, so there is no separate top-level
 * awaiting-dataset state.
 *
 * A dataset that was already provisioned (e.g. via "Create Dataset") but
 * whose Meta scope is missing — no manual token either, so events cannot
 * flow — renders as "awaitingScope": the dataset id must stay visible while
 * the user is nudged to reconnect and grant the missing permission, rather
 * than falling back to the method chooser and losing that dataset id from
 * view.
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
  if (isAwaitingCapiScope(input)) {
    return "awaitingScope"
  }
  return "disconnected"
}
