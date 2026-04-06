import { workspaceMembersAuthenticatedAPI } from "./authenticated"
import workspaceMembersAPIs from "./workspace-token"

export const workspaceMembersAPI = {
  ...workspaceMembersAuthenticatedAPI,
  ...workspaceMembersAPIs,
}
