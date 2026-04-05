import privateAPIs from "./authenticated"
import workspaceTokenAuthAPIs from "./workspace-token"

const contactsAPIs = {
  ...workspaceTokenAuthAPIs,
  ...privateAPIs,
}

export default contactsAPIs
