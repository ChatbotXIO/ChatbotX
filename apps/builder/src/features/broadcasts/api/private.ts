import { broadcastAnalyticsService } from "@chatbotx.io/analytics"
import {
  getBroadcastStatsResponse,
  listBroadcastContactsRequest,
  listBroadcastContactsResponse,
} from "@chatbotx.io/analytics/schemas"
import {
  broadcastRecurrenceService,
  broadcastService,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { channelTypes } from "@chatbotx.io/database/partials"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  listBroadcastOccurrencesPublicRequest,
  listBroadcastOccurrencesPublicResponse,
  listBroadcastRunGroupsPublicRequest,
  listBroadcastRunGroupsPublicResponse,
  previewRecurrencePublicRequest,
  previewRecurrencePublicResponse,
} from "../schema/public"

const selectOptionResource = z.object({
  id: z.string(),
  name: z.string(),
})

const listBroadcastOptionsRequest = z.object({
  workspaceId: z.string(),
  channel: channelTypes,
})

const listBroadcastOptionsResponse = z.object({
  data: z.array(selectOptionResource),
})

const getBatchBroadcastStatsRequest = z.object({
  workspaceId: z.string(),
  broadcastIds: z.array(z.string()),
})

const getBatchBroadcastStatsResponse = z.record(
  z.string(),
  getBroadcastStatsResponse,
)

const getBroadcastTemplateDetailRequest = z.object({
  workspaceId: z.string(),
  broadcastId: z.string(),
})

const broadcastTemplateDetailResource = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("whatsapp"),
    id: z.string(),
    name: z.string(),
    language: z.string(),
    category: z.string(),
    status: z.string(),
    components: z.unknown(),
    inboxId: z.string(),
    integrationName: z.string().nullable(),
  }),
  z.object({
    channel: z.literal("messenger"),
    id: z.string(),
    name: z.string(),
    language: z.string(),
    category: z.string(),
    status: z.string(),
    parameterFormat: z.string(),
    components: z.unknown(),
    inboxId: z.string(),
    integrationName: z.string().nullable(),
  }),
])

/** One entry per page the broadcast sends a template from; empty for flow sends. */
const listBroadcastTemplateDetailsResponse = z.array(
  broadcastTemplateDetailResource,
)

const workspaceScoped = z.object({ workspaceId: z.string() })

export const broadcastPrivateAPIs = {
  // The same service methods as the public `previewRecurrence`, `listRunGroups`
  // and `listOccurrences`: the builder shows exactly what an agent reads.
  privatePreviewBroadcastRecurrenceAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/broadcasts/preview-recurrence",
      summary: "Preview repeat rule",
      tags: ["Broadcasts"],
    })
    .input(workspaceScoped.extend(previewRecurrencePublicRequest.shape))
    .output(previewRecurrencePublicResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(({ input }) =>
      broadcastRecurrenceService.previewUpcoming({
        rule: input.recurrence,
        count: input.count,
        now: new Date(),
      }),
    ),

  privateListBroadcastRunGroupsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/broadcasts/{idOrName}/run-groups",
      summary: "List repeating broadcast runs by period",
      tags: ["Broadcasts"],
    })
    .input(workspaceScoped.extend(listBroadcastRunGroupsPublicRequest.shape))
    .output(listBroadcastRunGroupsPublicResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(({ input }) =>
      broadcastRecurrenceService.listRunGroups({
        workspaceId: input.workspaceId,
        idOrName: input.idOrName,
        granularity: input.groupBy,
        timezone: input.timezone,
        limit: input.limit,
        cursor: input.cursor,
      }),
    ),

  privateListBroadcastOccurrencesAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/broadcasts/{idOrName}/occurrences",
      summary: "List repeating broadcast slots",
      tags: ["Broadcasts"],
    })
    .input(workspaceScoped.extend(listBroadcastOccurrencesPublicRequest.shape))
    .output(listBroadcastOccurrencesPublicResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(({ input }) =>
      broadcastRecurrenceService.listOccurrences({
        workspaceId: input.workspaceId,
        idOrName: input.idOrName,
        from: input.from,
        to: input.to,
        limit: input.limit,
        cursor: input.cursor,
      }),
    ),

  privateListBroadcastOptionsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/broadcasts/options",
      summary: "List broadcast options",
      tags: ["Broadcasts"],
    })
    .input(listBroadcastOptionsRequest)
    .output(listBroadcastOptionsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => ({
      data: await broadcastService.listOptions(input),
    })),

  privateGetBatchBroadcastStatsAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/broadcasts/stats",
      summary: "Get batch broadcast stats",
      tags: ["Broadcasts"],
    })
    .input(getBatchBroadcastStatsRequest)
    .output(getBatchBroadcastStatsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      // A soft-deleted broadcast reads as "not found": its id is silently
      // dropped rather than surfacing stale stats.
      const existingIds = await broadcastService.listExistingIds({
        workspaceId: input.workspaceId,
        ids: input.broadcastIds,
      })
      return await broadcastAnalyticsService.getBatchStats({
        workspaceId: input.workspaceId,
        broadcastIds: existingIds,
      })
    }),

  privateListBroadcastTemplateDetailsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/broadcasts/{broadcastId}/template-details",
      summary: "List broadcast template details (one per page)",
      tags: ["Broadcasts"],
    })
    .input(getBroadcastTemplateDetailRequest)
    .output(listBroadcastTemplateDetailsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(
      async ({ input }) => await broadcastService.listTemplateDetails(input),
    ),

  privateListBroadcastContactsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/broadcasts/{broadcastId}/contacts",
      summary: "List broadcast contacts by event type",
      tags: ["Broadcasts"],
    })
    .input(listBroadcastContactsRequest)
    .output(listBroadcastContactsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { workspaceId, broadcastId, eventType, page, perPage } = input

      if (!eventType) {
        const [existingId] = await broadcastService.listExistingIds({
          workspaceId,
          ids: [broadcastId],
        })
        if (!existingId) {
          throw notFoundException("Broadcast not found")
        }
        return { data: [], total: 0, page, pageCount: 0 }
      }

      const { data, total, pageCount } =
        await broadcastService.listContactsPage({
          workspaceId,
          broadcastId,
          eventType,
          page,
          perPage,
        })

      return { data, total, page, pageCount }
    }),
}
