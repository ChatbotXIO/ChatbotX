import type { FlowEventType, MessageEventType } from "@chatbotx.io/flow-config"
import { flowEventType, messageEventType } from "@chatbotx.io/flow-config"
import { z } from "zod"

export const broadcastEventType = z.union([messageEventType, flowEventType])

export type BroadcastEventType = MessageEventType | FlowEventType

export const getBroadcastStatsRequest = z.object({
  workspaceId: z.string(),
  broadcastId: z.string(),
})

export type GetBroadcastStatsRequest = z.infer<typeof getBroadcastStatsRequest>

export const getBroadcastStatsResponse = z.object({
  "message:sent": z.number(),
  "message:delivered": z.number(),
  "message:seen": z.number(),
  "flow:clicked": z.number(),
  "message:failed": z.number(),
})

export type GetBroadcastStatsResponse = z.infer<
  typeof getBroadcastStatsResponse
>
export type BroadcastStats = GetBroadcastStatsResponse

export const listBroadcastContactsRequest = z.object({
  workspaceId: z.string(),
  broadcastId: z.string(),
  eventType: broadcastEventType,
  total: z.number().optional(),
  page: z.number().default(1),
  perPage: z.number().default(20),
})

export type ListBroadcastContactsRequest = z.infer<
  typeof listBroadcastContactsRequest
>

export const broadcastContactResource = z.object({
  contactId: z.string(),
  contactInboxId: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  sourceId: z.string().nullable(),
  avatar: z.string().nullable(),
  channel: z.string().nullable(),
  errorContent: z.string().nullable(),
  occurredAt: z.string(),
})

export type BroadcastContactResource = z.infer<typeof broadcastContactResource>

export const broadcastContactData = broadcastContactResource.extend({
  conversationId: z.string(),
})

export type BroadcastContactData = z.infer<typeof broadcastContactData>

export const listBroadcastContactsResponse = z.object({
  data: z.array(broadcastContactData),
  total: z.number(),
  page: z.number(),
  pageCount: z.number(),
})

export type ListBroadcastContactsResponse = z.infer<
  typeof listBroadcastContactsResponse
>

export const broadcastUpdateItem = z.object({
  workspaceId: z.string(),
  broadcastId: z.string(),
  contactId: z.string(),
  contactInboxId: z.string(),
  occurredAt: z.number(),
})

export type BroadcastUpdateItem = z.infer<typeof broadcastUpdateItem>
