import { inboxTeamsAuthenticatedAPI } from "./private"
import { inboxTeamsWorkspaceTokenAPIs } from "./workspace-token"

export const inboxTeamsAPI = {
  ...inboxTeamsAuthenticatedAPI,
  ...inboxTeamsWorkspaceTokenAPIs,
}
