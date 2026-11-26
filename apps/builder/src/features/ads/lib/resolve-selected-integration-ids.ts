type InboxBoundIntegration = { id: string; inboxId: string }

/**
 * Which integrations of one channel an Ads section aggregates.
 *
 * - `all`: no inbox is selected (or all, which the shared filter stores as
 *   none): every connected integration of the channel.
 * - `selected`: the channel's integrations bound to the selected inboxes.
 * - `none`: inboxes are selected but none maps to an integration of this
 *   channel (a bookmarked inbox that was disconnected, or only other
 *   channels' inboxes). The section shows empty results; it must never fall
 *   back to "all", which would show data the explicit selection excludes.
 */
export type IntegrationScope =
  | { kind: "all" }
  | { kind: "selected"; ids: string[] }
  | { kind: "none" }

/** Maps the shared Inbox filter's selection onto this channel's integrations. */
export function resolveIntegrationScope(input: {
  integrations: readonly InboxBoundIntegration[]
  inboxIds: readonly string[]
}): IntegrationScope {
  const { integrations, inboxIds } = input
  if (inboxIds.length === 0) {
    return { kind: "all" }
  }
  const ids = integrations
    .filter((integration) => inboxIds.includes(integration.inboxId))
    .map((integration) => integration.id)
  return ids.length > 0 ? { kind: "selected", ids } : { kind: "none" }
}

/**
 * The inbox a legacy `channelAccount` / `account` link (old bookmarks, the
 * CAPI connect redirect) points at, when it names one of the channel's
 * integrations. The page redirects to the shared `inboxIds` form so the
 * effective scope shows in the shared row and the legacy params leave the URL.
 */
export function resolveLegacyInboxId(input: {
  integrations: readonly InboxBoundIntegration[]
  legacyIntegrationId: string
}): string | null {
  const match = input.integrations.find(
    (integration) => integration.id === input.legacyIntegrationId,
  )
  return match?.inboxId ?? null
}

/** Whether the single-integration actions (CSV export, retarget, broadcast) stay inside the selection. */
export function singleIntegrationId(scope: IntegrationScope): string | null {
  if (scope.kind !== "selected") {
    return null
  }
  return scope.ids.length === 1 ? (scope.ids[0] ?? null) : null
}
