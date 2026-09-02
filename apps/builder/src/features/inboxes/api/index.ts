import { inboxesAuthenticatedAPI } from "./private"
import inboxesWorkspaceTokenAPIs from "./workspace-token"

export const inboxesAPI = {
  ...inboxesAuthenticatedAPI,
  ...inboxesWorkspaceTokenAPIs,
}
