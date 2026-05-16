import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const messageEventTypes = z.enum([
  "message_human_sent",
  "message_bot_sent",
])
export type MessageEventType = z.infer<typeof messageEventTypes>

export const messageSenderTypes = z.enum(["bot", "human"])
export type MessageSenderType = z.infer<typeof messageSenderTypes>

export const messageEventSchema = z.object({
  adminId: zodBigintAsString().optional(),
  channel: z.string().optional(),
  workspaceId: zodBigintAsString(),
  contactId: zodBigintAsString(),
  eventId: zodBigintAsString(),
  eventType: messageEventTypes,
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.date(),
  senderType: messageSenderTypes.optional(),
  source: z.string().nullish(),
  sourceId: z.string().nullish(),
})
export type MessageEvent = z.infer<typeof messageEventSchema>

export type CreateMessageEvent = Omit<MessageEvent, "eventId">

export const messageStatsSchema = z.object({
  workspaceId: z.string(),
  count: z.number(),
  eventType: messageEventTypes,
  timestamp: z.date(),
  uniqueContacts: z.number(),
})
export type MessageStats = z.infer<typeof messageStatsSchema>
