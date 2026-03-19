import { contactAnalyticsService } from "@chatbotx.io/analytics"
import {
  type ContactsByDimension,
  getContactCountsResponseSchema,
  getContactsByDimensionStatsResponseSchema,
  getContactsCountResponseSchema,
  timeRangeQuerySchema,
} from "@chatbotx.io/analytics/schemas"
import { os } from "@orpc/server"
import z from "zod"

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
      const data = await contactAnalyticsService.getContactCountsPerDay(input)
      return { data }
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
      const data = await contactAnalyticsService.getContactCountsPerDay(input)
      return { data }
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
    .handler(async ({ input }) => {
      const count = await contactAnalyticsService.getNewContactsCount(input)
      return { data: { count } }
    }),
  contactsCountAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/contacts-count",
      summary: "Get contacts count",
      tags: ["Analytics"],
    })
    .input(timeRangeQuerySchema)
    .output(getContactsCountResponseSchema)
    .handler(async ({ input }) => {
      const count = await contactAnalyticsService.getContactsCount(input)
      return { data: { count } }
    }),
  activeContactsCountAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/active-contacts-count",
      summary: "Get active contacts count",
      tags: ["Analytics"],
    })
    .input(timeRangeQuerySchema)
    .output(getContactsCountResponseSchema)
    .handler(async ({ input }) => {
      const count = await contactAnalyticsService.getActiveContactsCount(input)
      return { data: { count } }
    }),
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
    }),
})
