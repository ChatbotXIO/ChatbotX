import privateAPIs from "./authenticated"
import {contactWorkspaceTokenAPIs} from "./workspace-token"

const contactsAPIs = {
  ...contactWorkspaceTokenAPIs,
  ...privateAPIs,
}

export default contactsAPIs
