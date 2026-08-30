import { oc } from "@orpc/contract"
import { publicListAiAgentsResponse } from "./resource"

export const listAiAgentsContract = oc
  .route({
    method: "GET",
    path: "/v1/ai-agents",
    summary: "List AI agents",
    tags: ["AI Agents"],
  })
  .output(publicListAiAgentsResponse)

export const aiAgentContract = {
  listAiAgentsContract,
}

export * from "./resource"
