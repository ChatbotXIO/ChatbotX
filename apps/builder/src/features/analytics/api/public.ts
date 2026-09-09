import {
  botMessageAnalyticsService,
  broadcastAnalyticsService,
  type ContactsByDimension,
  contactAnalyticsService,
  conversationAnalyticsService,
  flowAnalyticsService,
  macAnalyticsService,
  magicLinkAnalyticsService,
  messageAnalyticsService,
  refLinkAnalyticsService,
  sequenceAnalyticsService,
} from "@chatbotx.io/analytics"
import { invalidateCacheByTags, withCache } from "@chatbotx.io/redis"
import type { z } from "zod"
import {
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  botMessagesAIProvidersPublicResponse,
  botMessagesPublicResponse,
  broadcastStatsPublicRequest,
  broadcastStatsPublicResponse,
  contactCountsPublicResponse,
  contactsByDimensionPublicRequest,
  contactsByDimensionPublicResponse,
  contactsCountPublicResponse,
  conversationArchivedPublicResponse,
  conversationAssignedByAdminPublicResponse,
  conversationAssignedPublicResponse,
  conversationFollowUpsPublicResponse,
  conversationHandoffsPublicResponse,
  flowStatsPublicRequest,
  flowStatsPublicResponse,
  humanAgentStatsPublicResponse,
  type linkContactPublicResource,
  linkContactsPublicRequest,
  linkContactsPublicResponse,
  linkStatsPublicRequest,
  linkStatsPublicResponse,
  macActiveContactCountPublicResponse,
  messagesByAdminPublicResponse,
  messagesBySenderPublicResponse,
  sequenceStepStatsPublicRequest,
  sequenceStepStatsPublicResponse,
  timeRangePublicRequest,
  timeRangeWithGranularityDMPublicRequest,
  timeRangeWithGranularityMHDPublicRequest,
  uniqueConversationsByAdminPublicResponse,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("analytics")

// Mirrors the internal `timeRangeKey` helper in
// `packages/analytics-nextjs/src/routes/contact.ts` (not exported from that
// package) so the public and internal surfaces share the same cache entries
// for identical inputs.
const timeRangeKey = (
  route: string,
  workspaceId: string,
  from: Date,
  to: Date,
  timezone: string,
) =>
  `analytics:${route}:${workspaceId}:${from.toISOString()}:${to.toISOString()}:${timezone}`

const flowStatsCacheTag = (flowId: string) => `flow-stats:${flowId}`
const flowStatsCacheKey = (workspaceId: string, flowId: string) =>
  `flow:stats:${workspaceId}:${flowId}`

const toLinkContact = (
  row: Awaited<
    ReturnType<typeof magicLinkAnalyticsService.getMagicLinkContactStats>
  >["data"][number],
): z.infer<typeof linkContactPublicResource> => ({
  contactId: row.contactId,
  contactInboxId: row.contactInboxId,
  sourceId: row.sourceId,
  channel: row.channel,
  conversationId: row.conversationId,
  occurredAt: row.occurredAt,
})

export const analyticsPublicRouter = {
  contactCountsPerDay: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/contact-counts-per-day",
      summary: "Get contact counts per day",
      tags: ["Analytics"],
    })
    .input(timeRangePublicRequest)
    .output(contactCountsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await contactAnalyticsService.getContactCountsPerDay({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  newContactCountsPerDay: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/new-contact-counts-per-day",
      summary: "Get new contact counts per day",
      tags: ["Analytics"],
    })
    .input(timeRangePublicRequest)
    .output(contactCountsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await contactAnalyticsService.getNewContactsPerDay({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  blockedContactsPerDay: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/blocked-contacts-per-day",
      summary: "Get blocked contacts per day",
      tags: ["Analytics"],
    })
    .input(timeRangePublicRequest)
    .output(contactCountsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await contactAnalyticsService.getBlockedContactsPerDay({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  blockedContactsCount: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/blocked-contacts-count",
      summary: "Get blocked contacts count",
      tags: ["Analytics"],
    })
    .input(timeRangePublicRequest)
    .output(contactsCountPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(({ context, input }) => {
      const workspaceId = context.workspace.id
      return withCache(
        timeRangeKey(
          "blocked-contacts-count",
          workspaceId,
          input.from,
          input.to,
          input.timezone,
        ),
        async () => {
          const count = await contactAnalyticsService.getBlockedContactsCount({
            ...input,
            workspaceId,
          })
          return { data: { count } }
        },
        { ttl: 120 },
      )
    }),

  newContactsCount: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/new-contacts-count",
      summary: "Get new contacts count",
      tags: ["Analytics"],
    })
    .input(timeRangePublicRequest)
    .output(contactsCountPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(({ context, input }) => {
      const workspaceId = context.workspace.id
      return withCache(
        timeRangeKey(
          "new-contacts-count",
          workspaceId,
          input.from,
          input.to,
          input.timezone,
        ),
        async () => {
          const count = await contactAnalyticsService.getNewContactsCount({
            ...input,
            workspaceId,
          })
          return { data: { count } }
        },
        { ttl: 120 },
      )
    }),

  contactsCount: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/contacts-count",
      summary: "Get contacts count",
      tags: ["Analytics"],
    })
    .input(timeRangePublicRequest)
    .output(contactsCountPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(({ context, input }) => {
      const workspaceId = context.workspace.id
      return withCache(
        timeRangeKey(
          "contacts-count",
          workspaceId,
          input.from,
          input.to,
          input.timezone,
        ),
        async () => {
          const count = await contactAnalyticsService.getContactsCount({
            ...input,
            workspaceId,
          })
          return { data: { count } }
        },
        { ttl: 120 },
      )
    }),

  activeContactsCount: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/active-contacts-count",
      summary: "Get active contacts count",
      tags: ["Analytics"],
    })
    .input(timeRangePublicRequest)
    .output(contactsCountPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(({ context, input }) => {
      const workspaceId = context.workspace.id
      return withCache(
        timeRangeKey(
          "active-contacts-count",
          workspaceId,
          input.from,
          input.to,
          input.timezone,
        ),
        async () => {
          const count =
            await macAnalyticsService.getActiveContactsByWorkspaceForRange({
              ...input,
              workspaceId,
            })
          return { data: { count } }
        },
        { ttl: 120 },
      )
    }),

  contactsByDimension: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/contacts-by-dimension",
      summary: "Get contacts by dimension",
      tags: ["Analytics"],
    })
    .input(contactsByDimensionPublicRequest)
    .output(contactsByDimensionPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const request = { ...input, workspaceId: context.workspace.id }
      let data: ContactsByDimension[] = []

      switch (input.dimension) {
        case "country":
          data = await contactAnalyticsService.getContactsByCountry(request)
          break
        case "channel":
          data = await contactAnalyticsService.getContactsByChannel(request)
          break
        case "source":
          data = await contactAnalyticsService.getContactsBySource(request)
          break
        default:
          data = []
      }

      return { data }
    }),

  messagesByAdmin: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/messages-by-admin",
      summary: "Get messages sent by admin",
      tags: ["Analytics"],
    })
    .input(timeRangePublicRequest)
    .output(messagesByAdminPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await messageAnalyticsService.getMessagesByAdmin({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  humanAgentStats: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/human-agent-stats",
      summary: "Get human agent statistics",
      tags: ["Analytics"],
    })
    .input(timeRangePublicRequest)
    .output(humanAgentStatsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await messageAnalyticsService.getHumanAgentStats({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  conversationHandoffs: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/conversation-handoffs",
      summary: "Get conversation handoffs",
      tags: ["Analytics"],
    })
    .input(timeRangePublicRequest)
    .output(conversationHandoffsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await conversationAnalyticsService.getHandoffsByDay({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  conversationFollowUps: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/conversation-followups",
      summary: "Get conversation follow-ups",
      tags: ["Analytics"],
    })
    .input(timeRangePublicRequest)
    .output(conversationFollowUpsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await conversationAnalyticsService.getFollowUpsByDay({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  conversationArchived: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/conversation-archived",
      summary: "Get archived conversations",
      tags: ["Analytics"],
    })
    .input(timeRangePublicRequest)
    .output(conversationArchivedPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await conversationAnalyticsService.getArchivedByDay({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  conversationAssigned: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/conversation-assigned",
      summary: "Get assigned conversations",
      tags: ["Analytics"],
    })
    .input(timeRangePublicRequest)
    .output(conversationAssignedPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await conversationAnalyticsService.getAssignedByDay({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  conversationAssignedByAdmin: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/conversation-assigned-by-admin",
      summary: "Get assigned conversations by admin",
      tags: ["Analytics"],
    })
    .input(timeRangePublicRequest)
    .output(conversationAssignedByAdminPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await conversationAnalyticsService.getAssignedByAdmin({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  uniqueConversationsByAdmin: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/unique-conversations-by-admin",
      summary: "Get unique conversations by admin",
      tags: ["Analytics"],
    })
    .input(timeRangePublicRequest)
    .output(uniqueConversationsByAdminPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data =
        await conversationAnalyticsService.getUniqueConversationsByAdmin({
          ...input,
          workspaceId: context.workspace.id,
        })
      return { data }
    }),

  botMessagesByResult: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/bot-messages-by-result",
      summary: "Get bot messages by result",
      tags: ["Analytics"],
    })
    .input(timeRangeWithGranularityMHDPublicRequest)
    .output(botMessagesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await botMessageAnalyticsService.getMessagesByResult({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  botMessagesWithResponse: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/bot-messages-with-response",
      summary: "Get bot messages with response",
      tags: ["Analytics"],
    })
    .input(timeRangeWithGranularityMHDPublicRequest)
    .output(botMessagesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await botMessageAnalyticsService.getMessagesWithResponse({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  botMessagesNoResponse: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/bot-messages-no-response",
      summary: "Get bot messages with no response",
      tags: ["Analytics"],
    })
    .input(timeRangeWithGranularityMHDPublicRequest)
    .output(botMessagesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await botMessageAnalyticsService.getMessagesWithNoResponse({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  botMessagesAiProviders: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/bot-messages-ai-providers",
      summary: "Get bot messages AI providers",
      tags: ["Analytics"],
    })
    .input(timeRangePublicRequest)
    .output(botMessagesAIProvidersPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await botMessageAnalyticsService.getAIProviderStats({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  messagesBySender: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/messages-by-sender",
      summary: "Get messages by sender",
      tags: ["Analytics"],
    })
    .input(timeRangeWithGranularityDMPublicRequest)
    .output(messagesBySenderPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await messageAnalyticsService.getMessagesBySender({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  broadcastStats: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/broadcasts/{broadcastId}/stats",
      summary: "Get broadcast stats",
      tags: ["Analytics"],
    })
    .input(broadcastStatsPublicRequest)
    .output(broadcastStatsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(({ context, input }) => {
      const workspaceId = context.workspace.id
      return withCache(
        `analytics:broadcast-stats:${workspaceId}:${input.broadcastId}`,
        async () =>
          await broadcastAnalyticsService.getStats({
            workspaceId,
            broadcastId: input.broadcastId,
          }),
        { ttl: 120 },
      )
    }),

  sequenceStepStats: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/sequences/{sequenceId}/steps/{stepId}/stats",
      summary: "Get sequence step stats",
      tags: ["Analytics"],
    })
    .input(sequenceStepStatsPublicRequest)
    .output(sequenceStepStatsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(({ context, input }) => {
      const workspaceId = context.workspace.id
      return withCache(
        `analytics:sequence-step-stats:${workspaceId}:${input.sequenceId}:${input.stepId}`,
        async () =>
          await sequenceAnalyticsService.getStepStats({
            workspaceId,
            sequenceId: input.sequenceId,
            stepId: input.stepId,
          }),
        { ttl: 120 },
      )
    }),

  macActiveContactCount: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/mac/active-count",
      summary: "Get current period MAC count for the workspace",
      tags: ["Analytics"],
    })
    .output(macActiveContactCountPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context }) => {
      const macCount =
        await macAnalyticsService.getActiveContactCountByWorkspaceId({
          workspaceId: context.workspace.id,
        })
      return { data: { macCount } }
    }),

  flowStats: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/flows/{flowId}",
      summary: "Get flow analytics",
      tags: ["Analytics"],
    })
    .input(flowStatsPublicRequest)
    .output(flowStatsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(({ context, input }) => {
      const workspaceId = context.workspace.id
      return withCache(
        flowStatsCacheKey(workspaceId, input.flowId),
        async () =>
          await flowAnalyticsService.getFlowStats({
            workspaceId,
            flowId: input.flowId,
          }),
        { ttl: 120, tags: [flowStatsCacheTag(input.flowId)] },
      )
    }),

  magicLinkStats: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/magic-links/stats",
      summary: "Get magic link stats",
      tags: ["Analytics"],
    })
    .input(linkStatsPublicRequest)
    .output(linkStatsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await magicLinkAnalyticsService.getMagicLinkStatsByDateRange(
        { ...input, workspaceId: context.workspace.id },
      )
      return { data }
    }),

  magicLinkContacts: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/magic-links/contacts",
      summary: "Get magic link contacts",
      tags: ["Analytics"],
    })
    .input(linkContactsPublicRequest)
    .output(linkContactsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const result = await magicLinkAnalyticsService.getMagicLinkContactStats({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { ...result, data: result.data.map(toLinkContact) }
    }),

  refLinkStats: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/ref-links/stats",
      summary: "Get ref link stats",
      tags: ["Analytics"],
    })
    .input(linkStatsPublicRequest)
    .output(linkStatsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await refLinkAnalyticsService.getRefLinkStatsByDateRange({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  refLinkContacts: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/ref-links/contacts",
      summary: "Get ref link contacts",
      tags: ["Analytics"],
    })
    .input(linkContactsPublicRequest)
    .output(linkContactsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const result = await refLinkAnalyticsService.getRefLinkContactStats({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { ...result, data: result.data.map(toLinkContact) }
    }),

  resetFlowStats: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/analytics/flows/{flowId}",
      summary: "Reset flow analytics",
      description:
        "Permanently clears the flow's analytics sessions. This cannot be undone. Unavailable to read_only tokens (DELETE is blocked for read_only permission).",
      successStatus: 204,
      tags: ["Analytics"],
    })
    .input(flowStatsPublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await flowAnalyticsService.resetStatsSession({
        workspaceId,
        flowId: input.flowId,
      })
      await invalidateCacheByTags([flowStatsCacheTag(input.flowId)])
    }),
}
