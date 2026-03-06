import privateTagsAPI from "./private"
import publicTagsAPI from "./public"

const tagsAPI = {
  ...privateTagsAPI,
  ...publicTagsAPI,
}

export default tagsAPI
