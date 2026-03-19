import { z } from "zod"
import {
  contactEventTypeSchema,
  contactSenderTypeSchema,
} from "./contact-event"

export const contactStatsSchema = z.object({
  chatbotId: z.string(),
  count: z.number(),
  eventType: contactEventTypeSchema,
  timestamp: z.date(),
  uniqueContacts: z.number(),
})
export type ContactStats = z.infer<typeof contactStatsSchema>

export const contactsByDimensionSchema = z.object({
  count: z.number(),
  dimension: z.string(),
  uniqueContacts: z.number(),
})
export type ContactsByDimension = z.infer<typeof contactsByDimensionSchema>

export const getContactsByDimensionStatsResponseSchema = z.object({
  data: z.array(contactsByDimensionSchema),
})
export type GetContactsByDimensionStatsResponseSchema = z.infer<
  typeof getContactsByDimensionStatsResponseSchema
>

export const messagesBySenderStatsSchema = z.object({
  channel: z.string(),
  chatbotId: z.string(),
  count: z.number(),
  senderType: contactSenderTypeSchema,
  timestamp: z.date(),
})
export type MessagesBySenderStats = z.infer<typeof messagesBySenderStatsSchema>

export const getMessagesBySenderStatsResponseSchema = z.object({
  data: z.array(messagesBySenderStatsSchema),
})
export type GetMessagesBySenderStatsResponseSchema = z.infer<
  typeof getMessagesBySenderStatsResponseSchema
>
