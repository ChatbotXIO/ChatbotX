import { inboxTeamsAuthenticatedAPI } from "./authenticated"
import { inboxTeamsWorkspaceTokenAPIs } from "./workspace-token"

export const inboxTeamsAPI = {
  ...inboxTeamsAuthenticatedAPI,
  ...inboxTeamsWorkspaceTokenAPIs,
}
