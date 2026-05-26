import {
  flowAnalyticsService,
  flowContactStatsRequest,
  flowNodeStatsResponse,
  flowStatsRequest,
  listFlowNodeContactsResponse,
} from "@chatbotx.io/analytics"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listFlows } from "../queries"
import { listFlowsRequest, listFlowsResponse } from "../schemas/query"

export const privateFlowsAPI = {
  privateListFlowsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/flows",
      summary: "Listar fluxos",
      tags: ["Fluxos"],
    })
    .input(listFlowsRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listFlowsResponse)
    .handler(async ({ input }) => {
      const { workspaceId, ...rest } = input

      return await listFlows({ ...rest, workspaceId })
    }),

  privateGetFlowStatsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/flows/{flowId}/stats",
      summary: "Obter estatísticas do fluxo",
      tags: ["Fluxos"],
    })
    .input(flowStatsRequest)
    .output(flowNodeStatsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(
      async ({ input }) =>
        await flowAnalyticsService.getFlowStats({
          workspaceId: input.workspaceId,
          flowId: input.flowId,
        }),
    ),

  privateGetFlowContactStatsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/flows/{flowId}/contacts",
      summary: "Obter contatos do evento do fluxo",
      tags: ["Fluxos"],
    })
    .input(flowContactStatsRequest)
    .output(listFlowNodeContactsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(
      async ({ input }) =>
        await flowAnalyticsService.getContactStats({
          workspaceId: input.workspaceId,
          flowId: input.flowId,
          eventType: input.eventType,
          nodeId: input.nodeId,
        }),
    ),
}
