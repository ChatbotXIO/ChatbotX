export const RealtimeEventType = {
  messageCreated: "messageCreated",
  messageStatusUpdated: "messageStatusUpdated",
  messageReactionUpdated: "messageReactionUpdated",
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

// Reaction (emoji) recebida do contato em uma Message outgoing. Disparado
// pelo worker received-message ao detectar webhook tipo "reaction" do
// WhatsApp. UI mostra emoji embaixo da bubble. `reaction: null` quando
// contato remove a reaction.
// 2026-05-26 — Sprint WhatsApp reactions.
export type RealtimeEventMessageReactionUpdated = {
  eventType: typeof RealtimeEventType.messageReactionUpdated
  data: {
    messageId: string
    conversationId: string
    reaction: {
      emoji: string
      by: "contact" | "agent"
      at: string
    } | null
  }
}

// Atualização de status de entrega (✓/✓✓/✓✓ azul/⚠️) sem precisar refresh.
// Disparado pelo listener `message-status-persist` no worker após receber
// webhook delivered/read/failed do canal (WhatsApp/Messenger/etc).
// 2026-05-26 — Sprint WhatsApp realtime delivery.
export type RealtimeEventMessageStatusUpdated = {
  eventType: typeof RealtimeEventType.messageStatusUpdated
  data: {
    messageId: string
    conversationId: string
    deliveredAt: string | null
    readAt: string | null
    failedAt: string | null
    failureReason: string | null
  }
}

export type RealtimeEventTyping = {
  eventType: typeof RealtimeEventType.typing
  data: {
    conversationId: string
    typing: boolean
    seconds: number
  }
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
  | RealtimeEventMessageStatusUpdated
  | RealtimeEventMessageReactionUpdated
  | RealtimeEventContactCommon
  | RealtimeEventConversationAssigned
  | RealtimeEventTyping
