import type { paths } from "../generated/chatbotx"
import type { ChatbotXAPI } from "../lib/api"

type ListFlowsResponse =
  paths["/v1/flows"]["get"]["responses"]["200"]["content"]["application/json"]

export const listFlows = (api: ChatbotXAPI): Promise<ListFlowsResponse> =>
  api.getClient().get("flows").json<ListFlowsResponse>()
