import privateAPIs from "./private"
import publicAPIs from "./public"

const contactsAPIs = {
  ...publicAPIs,
  ...privateAPIs,
}

export default contactsAPIs
