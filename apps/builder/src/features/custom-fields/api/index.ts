import chatbotTokenCustomFieldsAPI from "./chatbot-token"
import privateCustomFieldsAPI from "./private"

const customFieldsAPI = {
  ...chatbotTokenCustomFieldsAPI,
  ...privateCustomFieldsAPI,
}

export default customFieldsAPI
