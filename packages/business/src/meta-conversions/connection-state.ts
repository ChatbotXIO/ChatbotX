import { isCapiScopeRequired } from "./capi-scope-policy"
import type { MetaConversionsChannel } from "./schema"

/**
 * What the Conversions API tab shows: manage it (`connected`), connect it
 * (`notConnected`), or — only for a row set up before the dedicated connect
 * existed whose stored permission has lapsed — keep its settings and ask the
 * admin to `reconnect`. A dedicated connect stores a token and a dataset
 * together, so it never lapses into `reconnect`.
 */
export type CapiConnection = "connected" | "reconnect" | "notConnected"

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
 * connected. A user disconnect wins over everything else. A dataset with
 * neither a token nor the scope is a setup whose permission lapsed: its settings
 * are kept and the admin reconnects, rather than starting over.
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
    : "reconnect"
}
