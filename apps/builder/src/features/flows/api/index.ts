import flowChatbotTokenAPIs from "./chatbot-token"
import privateFlowsAPI from "./private"

const flowsAPI = {
  ...flowChatbotTokenAPIs,
  ...privateFlowsAPI,
}

export default flowsAPI
