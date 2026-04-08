import { inboxesAuthenticatedAPI } from "./authenticated"
import inboxesWorkspaceTokenAPIs from "./workspace-token"

export const inboxesAPI = {
  ...inboxesAuthenticatedAPI,
  ...inboxesWorkspaceTokenAPIs,
}
