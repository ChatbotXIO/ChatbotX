import chatbotTokenAPIs from "./chatbot-token"
import privateAPIs from "./private"

const contactsAPIs = {
  ...chatbotTokenAPIs,
  ...privateAPIs,
}

export default contactsAPIs
