export const RealtimeEventType = {
  CREATE_MESSAGE: "CREATE_MESSAGE",
} as const

export type RealtimeEventCreateMessage = {
  eventType: typeof RealtimeEventType.CREATE_MESSAGE
  data: unknown
}

export type RealtimeEventData = RealtimeEventCreateMessage
