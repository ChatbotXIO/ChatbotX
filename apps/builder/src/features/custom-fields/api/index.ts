import privateCustomFieldsAPI from "./private"
import customFieldsWorkspaceTokenAPI from "./workspace-token"

export const customFieldsAPI = {
  ...customFieldsWorkspaceTokenAPI,
  ...privateCustomFieldsAPI,
}
