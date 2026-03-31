import privateAPIs from "./authenticated"
import chatbotTokenAPIs from "./chatbot-token"

const contactsAPIs = {
  ...chatbotTokenAPIs,
  ...privateAPIs,
}

export default contactsAPIs
