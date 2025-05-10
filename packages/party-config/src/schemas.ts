export enum RealtimeEventType {
  CREATE_MESSAGE = "CREATE_MESSAGE",
}

export type RealtimeEventCreateMessage = {
  eventType: RealtimeEventType.CREATE_MESSAGE
  data: unknown
}

export type RealtimeEventData = RealtimeEventCreateMessage
