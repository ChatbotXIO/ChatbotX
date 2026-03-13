import { z } from "zod"
import type { paths } from "../generated/chatbotx"
import type { ChatbotXAPI } from "../lib/api"

type ListTagsResponse =
  paths["/v1/tags"]["get"]["responses"]["200"]["content"]["application/json"]

type CreateTagBody =
  paths["/v1/tags"]["post"]["requestBody"]["content"]["application/json"]
type CreateTagResponse =
  paths["/v1/tags"]["post"]["responses"]["201"]["content"]["application/json"]

type ShowTagPathParams = paths["/v1/tags/{id}"]["get"]["parameters"]["path"]
type ShowTagResponse =
  paths["/v1/tags/{id}"]["get"]["responses"]["200"]["content"]["application/json"]

type ShowTagByNamePathParams =
  paths["/v1/tags/name/{name}"]["get"]["parameters"]["path"]
type ShowTagByNameResponse =
  paths["/v1/tags/name/{name}"]["get"]["responses"]["200"]["content"]["application/json"]

type UpdateTagPathParams = paths["/v1/tags/{id}"]["put"]["parameters"]["path"]
type UpdateTagBody =
  paths["/v1/tags/{id}"]["put"]["requestBody"]["content"]["application/json"]
type UpdateTagInput = UpdateTagPathParams & UpdateTagBody
type UpdateTagResponse =
  paths["/v1/tags/{id}"]["put"]["responses"]["200"]["content"]["application/json"]

type DeleteTagPathParams =
  paths["/v1/tags/{id}"]["delete"]["parameters"]["path"]
type DeleteTagResponse =
  paths["/v1/tags/{id}"]["delete"]["responses"]["204"]["content"]["application/json"]

export const createTagInputSchema = z.object({
  name: z.string().min(1, "name is required"),
})

export const showTagInputSchema = z.object({
  id: z.string().min(1, "id is required"),
})

export const showTagByNameInputSchema = z.object({
  name: z.string().min(1, "name is required"),
})

export const updateTagInputSchema = z.object({
  id: z.string().min(1, "id is required"),
  name: z.string().min(1, "name is required"),
})

export const deleteTagInputSchema = z.object({
  id: z.string().min(1, "id is required"),
})

export const listTags = (api: ChatbotXAPI): Promise<ListTagsResponse> => {
  return api.getClient().get("tags").json<ListTagsResponse>()
}

export const createTag = (
  api: ChatbotXAPI,
  input: CreateTagBody,
): Promise<CreateTagResponse> => {
  return api
    .getClient()
    .post("tags", {
      json: input,
    })
    .json<CreateTagResponse>()
}

export const showTag = (
  api: ChatbotXAPI,
  input: ShowTagPathParams,
): Promise<ShowTagResponse> => {
  return api.getClient().get(`tags/${input.id}`).json<ShowTagResponse>()
}

export const showTagByName = (
  api: ChatbotXAPI,
  input: ShowTagByNamePathParams,
): Promise<ShowTagByNameResponse> => {
  return api
    .getClient()
    .get(`tags/name/${input.name}`)
    .json<ShowTagByNameResponse>()
}

export const updateTag = (
  api: ChatbotXAPI,
  input: UpdateTagInput,
): Promise<UpdateTagResponse> => {
  return api
    .getClient()
    .put(`tags/${input.id}`, {
      json: {
        name: input.name,
      },
    })
    .json<UpdateTagResponse>()
}

export const deleteTag = (
  api: ChatbotXAPI,
  input: DeleteTagPathParams,
): Promise<DeleteTagResponse> => {
  return api
    .getClient()
    .delete(`tags/${input.id}`, { json: {} })
    .json<DeleteTagResponse>()
}
