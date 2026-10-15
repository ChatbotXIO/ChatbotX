/** Builder pages of one Mini App. */

export const miniAppEditPath = (workspaceId: string, miniAppId: string) =>
  `/space/${workspaceId}/mini-apps/${miniAppId}/edit`

export const miniAppSubmissionsPath = (
  workspaceId: string,
  miniAppId: string,
) => `/space/${workspaceId}/mini-apps/${miniAppId}/submissions`
