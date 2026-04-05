import privateCustomFieldsAPI from "./private"
import customFieldsWorkspaceTokenAPI from "./workspace-token"

const customFieldsAPI = {
  ...customFieldsWorkspaceTokenAPI,
  ...privateCustomFieldsAPI,
}

export default customFieldsAPI
