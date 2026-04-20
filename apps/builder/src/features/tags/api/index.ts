import { privateTagsAPI } from "./private"
import { tagWorkspaceTokenAPIs } from "./token-auth"

export const tagsAPI = {
  ...privateTagsAPI,
  ...tagWorkspaceTokenAPIs,
}
