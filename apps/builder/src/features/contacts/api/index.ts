import { contactsAuthenticatedAPI } from "./private"
import workspaceTokenAuthAPIs from "./workspace-token"

export const contactsAPIs = {
  ...workspaceTokenAuthAPIs,
  ...contactsAuthenticatedAPI,
}
