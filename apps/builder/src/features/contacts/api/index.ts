import { contactsInternalAPI } from "./internal"
import workspaceTokenAuthAPIs from "./workspace-token"

const contactsAPIs = {
  ...workspaceTokenAuthAPIs,
  ...contactsInternalAPI,
}

export default contactsAPIs
