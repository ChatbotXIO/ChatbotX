import type { ChatbotXAPI } from "./index.js"
import type { Tag } from "./schemas/tag.js"

const TAGS_PREFIX = "/tags"

export const listTags = (api: ChatbotXAPI): Promise<{ data: Tag[] }> => {
  return api.request(TAGS_PREFIX, { method: "GET" })
}

export const createTag = (api: ChatbotXAPI, name: string): Promise<Tag> => {
  return api.request(TAGS_PREFIX, {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export const showTag = (api: ChatbotXAPI, id: string): Promise<Tag> => {
  return api.request(`${TAGS_PREFIX}/${id}`, { method: "GET" })
}

export const showTagByName = (api: ChatbotXAPI, name: string): Promise<Tag> => {
  return api.request(`${TAGS_PREFIX}/name/${name}`, { method: "GET" })
}

export const updateTag = (
  api: ChatbotXAPI,
  id: string,
  name: string,
): Promise<Tag> => {
  return api.request(`${TAGS_PREFIX}/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  })
}

export const deleteTag = (api: ChatbotXAPI, id: string): Promise<unknown> => {
  return api.request(`${TAGS_PREFIX}/${id}`, { method: "DELETE" })
}
