import z from "zod"

export const broadcastEventType = z.enum([
  "sent",
  "delivered",
  "seen",
  "clicked",
  "failed",
])

export type BroadcastEventType = z.infer<typeof broadcastEventType>

export const listBroadcastContactsRequest = z.object({
  chatbotId: z.string(),
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
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  sourceId: z.string().nullable(),
  avatar: z.string().nullable(),
  channel: z.string(),
  errorContent: z.string().nullable(),
  occurredAt: z.string().nullable(),
})

export type BroadcastContactResource = z.infer<typeof broadcastContactResource>

export const BroadcastContactData = broadcastContactResource.extend({
  conversationId: z.string(),
})

export type BroadcastContactData = z.infer<typeof BroadcastContactData>

export const listBroadcastContactsResponse = z.object({
  data: z.array(BroadcastContactData),
  total: z.number(),
  page: z.number(),
  pageCount: z.number(),
})

export type ListBroadcastContactsResponse = z.infer<
  typeof listBroadcastContactsResponse
>
