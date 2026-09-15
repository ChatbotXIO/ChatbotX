import type { WorkspaceApiTokenScope } from "@chatbotx.io/database/partials"

/**
 * UI registry for the resource-area scope axis. Being a `Record` keyed by
 * the full `WorkspaceApiTokenScope` union, adding a new scope value fails
 * compile here until it is registered — same invariant as `Record<ChannelType,
 * …>` — so the create-token checkboxes, table badges, and any future option
 * list can never silently drift from the enum.
 */
export const workspaceApiTokenScopeRegistry: Record<
  WorkspaceApiTokenScope,
  { labelKey: string; order: number }
> = {
  contacts: { labelKey: "fields.tokenScopes.contacts", order: 0 },
  inbox: { labelKey: "fields.tokenScopes.inbox", order: 1 },
  automation: { labelKey: "fields.tokenScopes.automation", order: 2 },
  broadcasts: { labelKey: "fields.tokenScopes.broadcasts", order: 3 },
  analytics: { labelKey: "fields.tokenScopes.analytics", order: 4 },
  ecommerce: { labelKey: "fields.tokenScopes.ecommerce", order: 5 },
  connections: { labelKey: "fields.tokenScopes.connections", order: 6 },
  minigames: { labelKey: "fields.tokenScopes.minigames", order: 7 },
  appointments: { labelKey: "fields.tokenScopes.appointments", order: 8 },
  media: { labelKey: "fields.tokenScopes.media", order: 9 },
  ads: { labelKey: "fields.tokenScopes.ads", order: 10 },
}

export const orderedWorkspaceApiTokenScopes = (
  Object.keys(workspaceApiTokenScopeRegistry) as WorkspaceApiTokenScope[]
).sort(
  (a, b) =>
    workspaceApiTokenScopeRegistry[a].order -
    workspaceApiTokenScopeRegistry[b].order,
)
