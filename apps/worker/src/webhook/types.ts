import type { Prisma } from "@aha.chat/database"

export type WebhookWithConditions = Prisma.WebhookGetPayload<{
  include: { conditions: true }
}>

export type WebhookEventData = {
  chatbotId: string
  contactId: string
  eventType: number
  eventData: Record<string, unknown>
  timestamp: Date
  source?: string
}
