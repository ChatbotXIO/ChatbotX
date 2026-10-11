import {
  flowAnalyticsService,
  flowNodeStatsResponse,
  flowStatsRequest,
} from "@chatbotx.io/analytics"
import {
  flowVersionService,
  messengerWelcomeMessageFlowService,
} from "@chatbotx.io/business"
import { convertStartNodeToMessengerAdsJson } from "@chatbotx.io/integration-messenger/messenger-ads"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { flowVersionResource } from "@/features/flow-versions/schema/resource"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listFlows } from "../queries"
import { listFlowsRequest, listFlowsResponse } from "../schema/query"
import { welcomeMessageFlowResource } from "../schema/resource"

const welcomeMessageFlowsField = z.array(welcomeMessageFlowResource)

export const privateFlowsAPI = {
  privateListFlowsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/flows",
      summary: "List flows",
      tags: ["Flows"],
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
      summary: "Get flow stats",
      tags: ["Flows"],
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

  privateListFlowVersionsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/flows/{flowId}/versions",
      summary: "List flow versions",
      tags: ["Flows"],
    })
    .input(withWorkspaceIdSchema.and(z.object({ flowId: zodBigintAsString() })))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.array(flowVersionResource))
    .handler(async ({ input }) =>
      flowVersionService.list({
        flowId: input.flowId,
        workspaceId: input.workspaceId,
      }),
    ),

  privateGetMessengerAdsJsonAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/flows/{flowId}/messenger-ads-json",
      summary: "Get Messenger Ads JSON",
      tags: ["Flows"],
    })
    .input(withWorkspaceIdSchema.and(z.object({ flowId: zodBigintAsString() })))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(
      z.discriminatedUnion("status", [
        z.object({
          status: z.literal("ok"),
          json: z.string(),
          welcomeMessageFlows: welcomeMessageFlowsField,
        }),
        z.object({
          status: z.literal("error"),
          reason: z.enum([
            "notPublished",
            "noStartNode",
            "invalidStepType",
            "invalidVariable",
          ]),
          // The sync converts leniently, so a flow the strict JSON rejects
          // can still have Meta welcome message flows to show.
          welcomeMessageFlows: welcomeMessageFlowsField,
        }),
      ]),
    )
    .handler(async ({ input }) => {
      const scope = { workspaceId: input.workspaceId, flowId: input.flowId }
      const [published, welcomeMessageFlows] = await Promise.all([
        flowVersionService.getMessengerAdsStartNode(scope),
        messengerWelcomeMessageFlowService.listCurrentByFlow(scope),
      ])

      // "Unpublished changes" is detected client-side (a toast fires before this
      // is called). Here we surface the two states the converter can't handle,
      // kept distinct so the client shows the right guidance: no published
      // version at all vs. published but no resolvable start node.
      if (published.status !== "ok") {
        return {
          status: "error" as const,
          reason: published.status,
          welcomeMessageFlows,
        }
      }

      const result = convertStartNodeToMessengerAdsJson({
        startNode: published.startNode,
        flowId: input.flowId,
        flowVersionId: published.flowVersionId,
      })

      if (result.status === "error") {
        return {
          status: "error" as const,
          reason: result.reason,
          welcomeMessageFlows,
        }
      }

      return {
        status: "ok" as const,
        json: JSON.stringify(result.messages),
        welcomeMessageFlows,
      }
    }),

  privateResetFlowStatsAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/flows/{flowId}/stats",
      summary: "Reset flow stats",
      tags: ["Flows"],
    })
    .input(flowStatsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      await flowAnalyticsService.resetStatsSession({
        workspaceId: input.workspaceId,
        flowId: input.flowId,
      })
    }),
}
