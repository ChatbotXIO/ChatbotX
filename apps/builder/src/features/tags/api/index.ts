import privateTagsAPI from "./private"
import { tagWorkspaceTokenAPIs } from "./token-auth"

const tagsAPI = {
  ...privateTagsAPI,
  ...tagWorkspaceTokenAPIs,
}

export default tagsAPI
