import type { paths } from "../generated/chatbotx"
import type { ChatbotXAPI } from "../lib/api"

type GetBotFieldPathParams =
  paths["/v1/bot-fields/{id}"]["get"]["parameters"]["path"]
type GetBotFieldResponse =
  paths["/v1/bot-fields/{id}"]["get"]["responses"]["200"]["content"]["application/json"]

type UpdateBotFieldPathParams =
  paths["/v1/bot-fields/{id}"]["put"]["parameters"]["path"]
type UpdateBotFieldBody =
  paths["/v1/bot-fields/{id}"]["put"]["requestBody"]["content"]["application/json"]
type UpdateBotFieldInput = UpdateBotFieldPathParams & UpdateBotFieldBody
type UpdateBotFieldResponse =
  paths["/v1/bot-fields/{id}"]["put"]["responses"]["200"]["content"]["application/json"]

type DeleteBotFieldPathParams =
  paths["/v1/bot-fields/{id}"]["delete"]["parameters"]["path"]
type DeleteBotFieldResponse =
  paths["/v1/bot-fields/{id}"]["delete"]["responses"]["200"]["content"]["application/json"]

export const getBotField = (
  api: ChatbotXAPI,
  input: GetBotFieldPathParams,
): Promise<GetBotFieldResponse> => {
  return api
    .getClient()
    .get(`bot-fields/${input.id}`)
    .json<GetBotFieldResponse>()
}

export const updateBotField = (
  api: ChatbotXAPI,
  input: UpdateBotFieldInput,
): Promise<UpdateBotFieldResponse> => {
  return api
    .getClient()
    .put(`bot-fields/${input.id}`, {
      json: {
        value: input.value,
      },
    })
    .json<UpdateBotFieldResponse>()
}

export const deleteBotField = (
  api: ChatbotXAPI,
  input: DeleteBotFieldPathParams,
): Promise<DeleteBotFieldResponse> => {
  return api
    .getClient()
    .delete(`bot-fields/${input.id}`, {
      json: {},
    })
    .json<DeleteBotFieldResponse>()
}
