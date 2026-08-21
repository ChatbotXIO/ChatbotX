export const RealtimeEventType = {
  messageCreated: "messageCreated",
  messageDeleted: "messageDeleted",
  messageUpdated: "messageUpdated",
  messageIdAssigned: "messageIdAssigned",
  messageFailed: "messageFailed",
  typing: "typing",
  contactBlocked: "contactBlocked",
  contactUnblocked: "contactUnblocked",
  conversationAssigned: "conversationAssigned",
  notifyExportResult: "notifyExportResult",
  whatsappCallRinging: "whatsappCallRinging",
  whatsappCallEnded: "whatsappCallEnded",
} as const

export type RealtimeEventCreateMessage = {
  eventType: typeof RealtimeEventType.messageCreated
  data: unknown
}

export type RealtimeEventMessageDeleted = {
  eventType: typeof RealtimeEventType.messageDeleted
  data: {
    messageIds: string[]
  }
}

export type RealtimeEventMessageIdAssigned = {
  eventType: typeof RealtimeEventType.messageIdAssigned
  data: {
    messageId: string
    commentId: string
  }
}

export type RealtimeEventMessageUpdated = {
  eventType: typeof RealtimeEventType.messageUpdated
  data: {
    messageId: string
    newText: string
    newAttachmentPath?: string | null
    newAttachmentPublicUrl?: string | null
    newAttachmentMimeType?: string | null
    newAttachmentWidth?: number
    newAttachmentHeight?: number
    removedAttachment?: boolean
  }
}

export type RealtimeEventMessageFailed = {
  eventType: typeof RealtimeEventType.messageFailed
  data: {
    messageId: string
    clientId?: string
    error: string | null
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

/**
 * A WhatsApp call's audio landed in a LiveKit room and an agent can pick it
 * up from the inbox (in-app calling, beta).
 */
export type RealtimeEventWhatsappCallRinging = {
  eventType: typeof RealtimeEventType.whatsappCallRinging
  data: {
    wacid: string
    roomName: string
    conversationId: string
    contactInboxId: string
    contactName?: string | null
  }
}

/** The call's LiveKit room closed — dismiss any incoming-call UI. */
export type RealtimeEventWhatsappCallEnded = {
  eventType: typeof RealtimeEventType.whatsappCallEnded
  data: {
    wacid: string
    roomName?: string
  }
}

export type RealtimeEventData =
  | RealtimeEventCreateMessage
  | RealtimeEventMessageDeleted
  | RealtimeEventMessageIdAssigned
  | RealtimeEventMessageUpdated
  | RealtimeEventMessageFailed
  | RealtimeEventContactCommon
  | RealtimeEventConversationAssigned
  | RealtimeEventTyping
  | RealtimeEventWhatsappCallRinging
  | RealtimeEventWhatsappCallEnded
