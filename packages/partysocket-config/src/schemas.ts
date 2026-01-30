export const RealtimeEventType = {
  messageCreated: "messageCreated",
  contactBlocked: "contactBlocked",
  contactUnblocked: "contactUnblocked",
  conversationAssigned: "conversationAssigned",
} as const

export type RealtimeEventCreateMessage = {
  eventType: typeof RealtimeEventType.messageCreated
  data: unknown
}

export type RealtimeEventContactCommon = {
  eventType:
    | typeof RealtimeEventType.contactBlocked
    | typeof RealtimeEventType.contactUnblocked
  data: {
    contactId: string
  }
}

export type RealtimeEventConversationAssigned = {
  eventType: typeof RealtimeEventType.conversationAssigned
  data: {
    conversationIds: string[]
    assignedUserId: string | null
    assignedInboxTeamId: string | null
  }
}

export type RealtimeEventData =
  | RealtimeEventCreateMessage
  | RealtimeEventContactCommon
  | RealtimeEventConversationAssigned
