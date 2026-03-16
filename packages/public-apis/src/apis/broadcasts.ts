import type { paths } from "../generated/chatbotx"
import type { ChatbotXAPI } from "../lib/api"

type ListBroadcastsResponse =
  paths["/v1/broadcasts"]["get"]["responses"]["200"]["content"]["application/json"]

export const listBroadcasts = (
  api: ChatbotXAPI,
): Promise<ListBroadcastsResponse> => {
  return api.getClient().get("broadcasts").json<ListBroadcastsResponse>()
}
