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

export const messagesByAdminStatsSchema = z.object({
  adminId: z.bigint(),
  chatbotId: z.bigint(),
  count: z.number(),
  userEmail: z.string().optional(),
  userName: z.string().optional(),
})
export type MessagesByAdminStats = z.infer<typeof messagesByAdminStatsSchema>

export const getMessagesByAdminStatsResponseSchema = z.object({
  data: z.array(messagesByAdminStatsSchema),
})
export type GetMessagesByAdminStatsResponseSchema = z.infer<
  typeof getMessagesByAdminStatsResponseSchema
>

export const uniqueContactsByAdminStatsSchema = z.object({
  chatbotId: z.bigint(),
  toAssignee: z.bigint(),
  count: z.number(),
  userName: z.string().optional(),
  userEmail: z.string().optional(),
})
export type UniqueContactsByAdminStats = z.infer<
  typeof uniqueContactsByAdminStatsSchema
>

export const humanAgentStatsSchema = z.object({
  adminId: z.bigint(),
  chatbotId: z.bigint(),
  assignedConversations: z.number(),
  messagesSent: z.number(),
  uniqueContacts: z.number(),
  userEmail: z.string().optional(),
  userName: z.string().optional(),
})
export type HumanAgentStats = z.infer<typeof humanAgentStatsSchema>

export const getHumanAgentStatsResponseSchema = z.object({
  data: z.array(humanAgentStatsSchema),
})
export type GetHumanAgentStatsResponseSchema = z.infer<
  typeof getHumanAgentStatsResponseSchema
>
