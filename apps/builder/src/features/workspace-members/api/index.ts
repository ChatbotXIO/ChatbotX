import { workspaceMembersAuthenticatedAPI } from "./private"
import workspaceMembersAPIs from "./workspace-token"

export const workspaceMembersAPI = {
  ...workspaceMembersAuthenticatedAPI,
  ...workspaceMembersAPIs,
}
