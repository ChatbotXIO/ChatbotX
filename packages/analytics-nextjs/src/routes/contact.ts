import {
  analyticsTimeRangeCacheKey,
  contactAnalyticsService,
  contactsByDimensionQuerySchema,
  getContactCountsResponseSchema,
  getContactsByDimensionStatsResponseSchema,
  getContactsCountResponseSchema,
  getHumanAgentStatsResponseSchema,
  getMessagesByAdminStatsResponseSchema,
  macAnalyticsService,
  messageAnalyticsService,
  timeRangeQueryWithFilterSchema,
} from "@chatbotx.io/analytics"
import { withCache } from "@chatbotx.io/redis"
import { os } from "@orpc/server"
import { logger } from "../lib/log"

export const analyticsContactRoutes = os.router({
  contactCountsPerDayAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/contact-counts-per-day",
      summary: "Get contact counts per day",
      tags: ["Analytics"],
    })
    .input(timeRangeQueryWithFilterSchema)
    .output(getContactCountsResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data = await contactAnalyticsService.getContactCountsPerDay(input)
        return { data }
      } catch (error) {
        logger.error({ err: error }, "[analytics:contactCountsPerDay] failed")
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
    .input(timeRangeQueryWithFilterSchema)
    .output(getContactCountsResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data = await contactAnalyticsService.getNewContactsPerDay(input)
        return { data }
      } catch (error) {
        logger.error(
          { err: error },
          "[analytics:newContactCountsPerDay] failed",
        )
        throw error
      }
    }),
  blockedContactsPerDayAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/blocked-contacts-per-day",
      summary: "Get blocked contacts per day",
      tags: ["Analytics"],
    })
    .input(timeRangeQueryWithFilterSchema)
    .output(getContactCountsResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data =
          await contactAnalyticsService.getBlockedContactsPerDay(input)
        return { data }
      } catch (error) {
        logger.error({ err: error }, "[analytics:blockedContactsPerDay] failed")
        throw error
      }
    }),
  blockedContactsCountAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/blocked-contacts-count",
      summary: "Get blocked contacts count",
      tags: ["Analytics"],
    })
    .input(timeRangeQueryWithFilterSchema)
    .output(getContactsCountResponseSchema)
    .handler(async ({ input }) =>
      withCache(
        analyticsTimeRangeCacheKey("blocked-contacts-count", input),
        async () => {
          try {
            const count =
              await contactAnalyticsService.getBlockedContactsCount(input)
            return { data: { count } }
          } catch (error) {
            logger.error(
              { err: error },
              "[analytics:blockedContactsCount] failed",
            )
            throw error
          }
        },
        { ttl: 120 },
      ),
    ),
  newContactsCountAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/new-contacts-count",
      summary: "Get new contact counts",
      tags: ["Analytics"],
    })
    .input(timeRangeQueryWithFilterSchema)
    .output(getContactsCountResponseSchema)
    .handler(async ({ input }) =>
      withCache(
        analyticsTimeRangeCacheKey("new-contacts-count", input),
        async () => {
          try {
            const count =
              await contactAnalyticsService.getNewContactsCount(input)
            return { data: { count } }
          } catch (error) {
            logger.error({ err: error }, "[analytics:newContactsCount] failed")
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
    .input(timeRangeQueryWithFilterSchema)
    .output(getContactsCountResponseSchema)
    .handler(async ({ input }) =>
      withCache(
        analyticsTimeRangeCacheKey("contacts-count", input),
        async () => {
          try {
            const count = await contactAnalyticsService.getContactsCount(input)
            return { data: { count } }
          } catch (error) {
            logger.error({ err: error }, "[analytics:contactsCount] failed")
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
    .input(timeRangeQueryWithFilterSchema)
    .output(getContactsCountResponseSchema)
    .handler(async ({ input }) =>
      withCache(
        analyticsTimeRangeCacheKey("active-contacts-count", input),
        async () => {
          try {
            const count =
              await macAnalyticsService.getActiveContactsByWorkspaceForRange(
                input,
              )
            return { data: { count } }
          } catch (error) {
            logger.error(
              { err: error },
              "[analytics:activeContactsCount] failed",
            )
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
    .input(contactsByDimensionQuerySchema)
    .output(getContactsByDimensionStatsResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data = await contactAnalyticsService.getContactsByDimension(input)
        return { data }
      } catch (error) {
        logger.error({ err: error }, "[analytics:contactsByDimension] failed")
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
    .input(timeRangeQueryWithFilterSchema)
    .output(getMessagesByAdminStatsResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data = await messageAnalyticsService.getMessagesByAdmin(input)
        return { data }
      } catch (error) {
        logger.error({ err: error }, "[analytics:messagesByAdmin] failed")
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
    .input(timeRangeQueryWithFilterSchema)
    .output(getHumanAgentStatsResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data = await messageAnalyticsService.getHumanAgentStats(input)
        return { data }
      } catch (error) {
        logger.error({ err: error }, "[analytics:humanAgentStats] failed")
        throw error
      }
    }),
})
