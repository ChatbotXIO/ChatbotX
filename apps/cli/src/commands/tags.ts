import { ChatbotXAPI } from "../api"
import {
  createTag as createTagApi,
  deleteTag as deleteTagApi,
  listTags as listTagsApi,
  showTag as showTagApi,
  showTagByName as showTagByNameApi,
  updateTag as updateTagApi,
} from "../apis/tags"

export const listTags = async (): Promise<void> => {
  const api = new ChatbotXAPI()
  const result = await listTagsApi(api)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

export const createTag = async (name: string): Promise<void> => {
  if (!name) {
    throw new Error("Tag name is required")
  }
  const api = new ChatbotXAPI()
  const result = await createTagApi(api, name)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

export const showTag = async (id: string): Promise<void> => {
  if (!id) {
    throw new Error("Tag ID is required")
  }
  const api = new ChatbotXAPI()
  const result = await showTagApi(api, id)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

export const showTagByName = async (name: string): Promise<void> => {
  if (!name) {
    throw new Error("Tag name is required")
  }
  const api = new ChatbotXAPI()
  const result = await showTagByNameApi(api, name)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

export const updateTag = async (id: string, name: string): Promise<void> => {
  if (!id) {
    throw new Error("Tag ID is required")
  }
  if (!name) {
    throw new Error("New tag name is required")
  }
  const api = new ChatbotXAPI()
  const result = await updateTagApi(api, id, name)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

export const deleteTag = async (id: string): Promise<void> => {
  if (!id) {
    throw new Error("Tag ID is required")
  }
  const api = new ChatbotXAPI()
  const result = await deleteTagApi(api, id)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
