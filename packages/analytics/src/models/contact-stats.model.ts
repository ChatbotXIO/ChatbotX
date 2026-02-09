import type { ContactEventType } from "./contact-event.model"

export interface TimeRange {
  from: Date
  to: Date
}

export interface ContactStats {
  chatbotId: string
  timestamp: Date
  eventType: ContactEventType
  count: number
  uniqueContacts: number
}

export interface ContactsByDimension {
  dimension: string
  count: number
  uniqueContacts: number
}

export interface DailyTotalContacts {
  day: Date
  totalContacts: number
}

export interface MessagesBySenderStats {
  chatbotId: string
  timestamp: Date
  channel: string
  senderType: "bot" | "human"
  count: number
}
