import type { ContactEventType } from "./contact-event.model"

export interface TimeRange {
  from: Date
  to: Date
}

export interface ContactStats {
  chatbotId: string
  count: number
  eventType: ContactEventType
  timestamp: Date
  uniqueContacts: number
}

export interface ContactsByDimension {
  count: number
  dimension: string
  uniqueContacts: number
}

export interface DailyTotalContacts {
  day: Date
  totalContacts: number
}

export interface MessagesBySenderStats {
  channel: string
  chatbotId: string
  count: number
  senderType: "bot" | "human"
  timestamp: Date
}
