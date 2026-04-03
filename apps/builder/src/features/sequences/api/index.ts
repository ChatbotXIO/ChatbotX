import { sequencesChatbotAuthAPI } from "./authorized"
import chatbotTokenSequencesAPIs from "./chatbot-token"

export const sequencesAPI = {
  ...sequencesChatbotAuthAPI,
  ...chatbotTokenSequencesAPIs,
}
