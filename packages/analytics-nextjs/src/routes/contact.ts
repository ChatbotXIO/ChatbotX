import {
  type ContactsByDimension,
  contactAnalyticsService,
  getContactCountsResponseSchema,
  getContactsByDimensionStatsResponseSchema,
  getContactsCountResponseSchema,
  getHumanAgentStatsResponseSchema,
  getMessagesByAdminStatsResponseSchema,
  messageAnalyticsService,
  timeRangeQuerySchema,
} from "@chatbotx.io/analytics"
import { withCache } from "@chatbotx.io/redis"
import { os } from "@orpc/server"
import z from "zod"

const timeRangeKey = (
  route: string,
  workspaceId: string,
  from: Date,
  to: Date,
  timezone: string,
) =>
  `analytics:${route}:${workspaceId}:${from.toISOString()}:${to.toISOString()}:${timezone}`

export const analyticsContactRoutes = os.router({
  contactCountsPerDayAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/contact-counts-per-day",
      summary: "Get contact counts per day",
      tags: ["Analytics"],
    })
    .input(timeRangeQuerySchema)
    .output(getContactCountsResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data = await contactAnalyticsService.getContactCountsPerDay(input)
        return { data }
      } catch (error) {
        console.log("[analytics:contactCountsPerDay] failed", error)
        throw error
      }
    }),
  newContactCountsPerDayAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/new-contact-counts-per-day",
      summary: "Get new contact counts per day",
      tags: ["Analytics"],
    })
    .input(timeRangeQuerySchema)
    .output(getContactCountsResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data = await contactAnalyticsService.getNewContactsPerDay(input)
        return { data }
      } catch (error) {
        console.log("[analytics:newContactCountsPerDay] failed", error)
        throw error
      }
    }),
  newContactsCountAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/new-contacts-count",
      summary: "Get new contact counts",
      tags: ["Analytics"],
    })
    .input(timeRangeQuerySchema)
    .output(getContactsCountResponseSchema)
    .handler(async ({ input }) =>
      withCache(
        timeRangeKey(
          "new-contacts-count",
          input.workspaceId,
          input.from,
          input.to,
          input.timezone,
        ),
        async () => {
          try {
            const count =
              await contactAnalyticsService.getNewContactsCount(input)
            return { data: { count } }
          } catch (error) {
            console.log("[analytics:newContactsCount] failed", error)
            throw error
          }
        },
        { ttl: 120 },
      ),
    ),
  contactsCountAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/contacts-count",
      summary: "Get contacts count",
      tags: ["Analytics"],
    })
    .input(timeRangeQuerySchema)
    .output(getContactsCountResponseSchema)
    .handler(async ({ input }) =>
      withCache(
        timeRangeKey(
          "contacts-count",
          input.workspaceId,
          input.from,
          input.to,
          input.timezone,
        ),
        async () => {
          try {
            const count = await contactAnalyticsService.getContactsCount(input)
            return { data: { count } }
          } catch (error) {
            console.log("[analytics:contactsCount] failed", error)
            throw error
          }
        },
        { ttl: 120 },
      ),
    ),
  activeContactsCountAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/active-contacts-count",
      summary: "Get active contacts count",
      tags: ["Analytics"],
    })
    .input(timeRangeQuerySchema)
    .output(getContactsCountResponseSchema)
    .handler(async ({ input }) =>
      withCache(
        timeRangeKey(
          "active-contacts-count",
          input.workspaceId,
          input.from,
          input.to,
          input.timezone,
        ),
        async () => {
          try {
            const count =
              await contactAnalyticsService.getActiveContactsCount(input)
            return { data: { count } }
          } catch (error) {
            console.log("[analytics:activeContactsCount] failed", error)
            throw error
          }
        },
        { ttl: 120 },
      ),
    ),
  contactsByDimensionAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/contacts-by-dimension",
      summary: "Get contacts by dimension",
      tags: ["Analytics"],
    })
    .input(
      timeRangeQuerySchema.extend({
        dimension: z.enum(["country", "channel", "source"]),
      }),
    )
    .output(getContactsByDimensionStatsResponseSchema)
    .handler(async ({ input }) => {
      try {
        let data: ContactsByDimension[] = []

        switch (input.dimension) {
          case "country":
            data = await contactAnalyticsService.getContactsByCountry(input)
            break
          case "channel":
            data = await contactAnalyticsService.getContactsByChannel(input)
            break
          case "source":
            data = await contactAnalyticsService.getContactsBySource(input)
            break
          default:
            data = []
        }

        return { data }
      } catch (error) {
        console.log("[analytics:contactsByDimension] failed", error)
        throw error
      }
    }),
  messagesByAdminAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/messages-by-admin",
      summary: "Get messages sent by admin",
      tags: ["Analytics"],
    })
    .input(timeRangeQuerySchema)
    .output(getMessagesByAdminStatsResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data = await messageAnalyticsService.getMessagesByAdmin(input)
        return { data }
      } catch (error) {
        console.log("[analytics:messagesByAdmin] failed", error)
        throw error
      }
    }),
  humanAgentStatsAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/human-agent-stats",
      summary: "Get human agent statistics",
      tags: ["Analytics"],
    })
    .input(timeRangeQuerySchema)
    .output(getHumanAgentStatsResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data = await messageAnalyticsService.getHumanAgentStats(input)
        return { data }
      } catch (error) {
        console.log("[analytics:humanAgentStats] failed", error)
        throw error
      }
    }),
})
