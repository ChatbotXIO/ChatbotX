/**
 * The one page a workspace stays reachable on during the deletion grace
 * window. Shared so redirect targets and exemption checks cannot drift apart.
 */
export const workspaceSettingsGeneralPath = (workspaceId: string): string =>
  `/space/${workspaceId}/settings/general`

export const workspaceSettingsChannelsPath = (workspaceId: string): string =>
  `/space/${workspaceId}/settings/channels`

/** Appends `?workspaceId=` when known, `encodeURIComponent`-safe — shared so the create-flow redirect targets never hand-build the query string three times over. */
export const withWorkspaceQuery = (
  path: string,
  workspaceId?: string | null,
): string =>
  workspaceId ? `${path}?workspaceId=${encodeURIComponent(workspaceId)}` : path
