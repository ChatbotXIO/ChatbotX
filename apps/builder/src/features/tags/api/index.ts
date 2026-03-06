import chatbotTagsAPI from "./chatbot-tags"
import publicTagsAPI from "./public-tags"

const tagsAPI = {
  ...chatbotTagsAPI,
  ...publicTagsAPI,
}

export default tagsAPI
