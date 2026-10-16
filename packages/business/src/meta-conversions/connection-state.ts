import { isCapiScopeRequired } from "./capi-scope-policy"
import type { MetaConversionsChannel } from "./schema"

/**
 * The only two states the Conversions API tab shows: connect it, or manage it.
 * Permission problems are not a state of their own — a dedicated connect stores
 * a token and a dataset together, so there is nothing left to check.
 */
export type CapiConnection = "connected" | "notConnected"

/**
 * Presence of the dedicated token, never the token itself: callers that only
 * need the state (public API, Ads tab) must not have to load ciphertext.
 */
export type CapiConnectionRow = {
  capiDisconnectedAt: Date | null
  hasCapiAccessToken: boolean
  datasetId: string | null
  hasCapiScope: boolean
}

/**
 * Derives the connection state from stored columns only — no Meta call.
 *
 * Rows connected before the dedicated connect existed carry no token of their
 * own and send with the channel token, so a dataset plus the stored scope flag
 * (or a channel exempt from the scope, see `capi-scope-policy`) still reads as
 * connected. A user disconnect wins over everything else.
 */
export function resolveCapiConnection(
  channel: MetaConversionsChannel,
  row: CapiConnectionRow,
): CapiConnection {
  if (row.capiDisconnectedAt || !row.datasetId) {
    return "notConnected"
  }

  const sendsWithChannelToken =
    row.hasCapiScope || !isCapiScopeRequired(channel)

  return row.hasCapiAccessToken || sendsWithChannelToken
    ? "connected"
    : "notConnected"
}
