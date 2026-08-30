import { refLinkAuthenticatedAPI } from "./private"
import refLinksWorkspaceTokenAPIs from "./workspace-token"

export const refLinksAPI = {
  ...refLinkAuthenticatedAPI,
  ...refLinksWorkspaceTokenAPIs,
}
