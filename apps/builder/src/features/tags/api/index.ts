import chatbotTokenTagsAPI from "./chatbot-token"
import privateTagsAPI from "./private"

const tagsAPI = {
  ...privateTagsAPI,
  ...chatbotTokenTagsAPI,
}

export default tagsAPI
