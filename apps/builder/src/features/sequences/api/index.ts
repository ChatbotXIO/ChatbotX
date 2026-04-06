import { sequencesChatbotAuthAPI } from "./authorized"
import chatbotTokenSequencesAPIs from "./workspace-token"

export const sequencesAPI = {
  ...sequencesChatbotAuthAPI,
  ...chatbotTokenSequencesAPIs,
}
