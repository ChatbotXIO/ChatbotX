export const RealtimeEventType = {
  messageCreated: "messageCreated",
  typing: "typing",
  contactBlocked: "contactBlocked",
  contactUnblocked: "contactUnblocked",
  conversationAssigned: "conversationAssigned",
  notifyExportResult: "notifyExportResult",
} as const

export type RealtimeEventCreateMessage = {
  eventType: typeof RealtimeEventType.messageCreated
  data: unknown
}

export type RealtimeEventTyping = {
  eventType: typeof RealtimeEventType.typing
  data: {
    conversationId: bigint
    typing: boolean
  }
}

export type RealtimeEventContactCommon = {
  eventType:
    | typeof RealtimeEventType.contactBlocked
    | typeof RealtimeEventType.contactUnblocked
  data: {
    contactId: bigint
  }
}

export type RealtimeEventConversationAssigned = {
  eventType: typeof RealtimeEventType.conversationAssigned
  data: {
    conversationIds: bigint[]
    assignedUserId: bigint | null
    assignedInboxTeamId: bigint | null
  }
}

export type RealtimeEventNotifyExportResult = {
  eventType: typeof RealtimeEventType.notifyExportResult
  data: {
    outputPath: string
    status: "pending" | "processing" | "completed" | "failed"
    error?: string
  }
}

export type RealtimeEventData =
  | RealtimeEventCreateMessage
  | RealtimeEventContactCommon
  | RealtimeEventConversationAssigned
  | RealtimeEventTyping
