/**
 * The one page a workspace stays reachable on during the deletion grace
 * window. Shared so redirect targets and exemption checks cannot drift apart.
 */
export const workspaceSettingsGeneralPath = (workspaceId: string): string =>
  `/space/${workspaceId}/settings/general`

export const workspaceSettingsChannelsPath = (workspaceId: string): string =>
  `/space/${workspaceId}/settings/channels`
