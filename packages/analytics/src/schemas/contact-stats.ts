import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { contactEventTypes, contactSenderTypes } from "./contact-event"

export const contactStatsSchema = z.object({
  workspaceId: z.string(),
  count: z.number(),
  eventType: contactEventTypes,
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
  channel: z.string().nullable(),
  workspaceId: z.string(),
  count: z.coerce.number(),
  senderType: contactSenderTypes,
  timestamp: z.coerce.date(),
})
export type MessagesBySenderStats = z.infer<typeof messagesBySenderStatsSchema>

export const getMessagesBySenderStatsResponseSchema = z.object({
  data: z.array(messagesBySenderStatsSchema),
})
export type GetMessagesBySenderStatsResponseSchema = z.infer<
  typeof getMessagesBySenderStatsResponseSchema
>

export const messagesByAdminStatsSchema = z.object({
  adminId: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
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
  workspaceId: zodBigintAsString(),
  toAssignee: zodBigintAsString(),
  count: z.number(),
  userName: z.string().optional(),
  userEmail: z.string().optional(),
})
export type UniqueContactsByAdminStats = z.infer<
  typeof uniqueContactsByAdminStatsSchema
>

export const humanAgentStatsSchema = z.object({
  adminId: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
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
