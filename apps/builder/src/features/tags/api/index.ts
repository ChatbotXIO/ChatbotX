import { privateTagsAPI } from "./private"
import { tagWorkspaceTokenAPIs } from "./workspace-token"

export const tagsAPI = {
  ...privateTagsAPI,
  ...tagWorkspaceTokenAPIs,
}
