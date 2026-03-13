import { z } from "zod"
import type { paths } from "../generated/chatbotx"
import type { ChatbotXAPI } from "../lib/api"

type ListCustomFieldsResponse =
  paths["/v1/custom-fields"]["get"]["responses"]["200"]["content"]["application/json"]

type CreateCustomFieldBody =
  paths["/v1/custom-fields"]["post"]["requestBody"]["content"]["application/json"]
type CreateCustomFieldResponse =
  paths["/v1/custom-fields"]["post"]["responses"]["200"]["content"]["application/json"]

type GetCustomFieldPathParams =
  paths["/v1/custom-fields/{id}"]["get"]["parameters"]["path"]
type GetCustomFieldResponse =
  paths["/v1/custom-fields/{id}"]["get"]["responses"]["200"]["content"]["application/json"]

type GetCustomFieldByNamePathParams =
  paths["/v1/custom-fields/name/{name}"]["get"]["parameters"]["path"]
type GetCustomFieldByNameResponse =
  paths["/v1/custom-fields/name/{name}"]["get"]["responses"]["200"]["content"]["application/json"]

export const createCustomFieldInputSchema = z.object({
  name: z.string().min(1, "name is required"),
  customFieldType: z.enum([
    "shortText",
    "number",
    "date",
    "datetime",
    "boolean",
    "longText",
  ]),
})

export const getCustomFieldInputSchema = z.object({
  id: z.string().min(1, "id is required"),
})

export const getCustomFieldByNameInputSchema = z.object({
  name: z.string().min(1, "name is required"),
})

export const listCustomFields = (
  api: ChatbotXAPI,
): Promise<ListCustomFieldsResponse> => {
  return api.getClient().get("custom-fields").json<ListCustomFieldsResponse>()
}

export const createCustomField = (
  api: ChatbotXAPI,
  input: CreateCustomFieldBody,
): Promise<CreateCustomFieldResponse> => {
  return api
    .getClient()
    .post("custom-fields", {
      json: input,
    })
    .json<CreateCustomFieldResponse>()
}

export const getCustomField = (
  api: ChatbotXAPI,
  input: GetCustomFieldPathParams,
): Promise<GetCustomFieldResponse> => {
  return api
    .getClient()
    .get(`custom-fields/${input.id}`)
    .json<GetCustomFieldResponse>()
}

export const getCustomFieldByName = (
  api: ChatbotXAPI,
  input: GetCustomFieldByNamePathParams,
): Promise<GetCustomFieldByNameResponse> => {
  return api
    .getClient()
    .get(`custom-fields/name/${input.name}`)
    .json<GetCustomFieldByNameResponse>()
}
