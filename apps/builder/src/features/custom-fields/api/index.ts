import privateCustomFieldsAPI from "./private"
import publicCustomFieldsAPI from "./public"

const customFieldsAPI = {
  ...publicCustomFieldsAPI,
  ...privateCustomFieldsAPI,
}

export default customFieldsAPI
