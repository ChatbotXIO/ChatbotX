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
  conversationCreated: "conversationCreated",
  conversationUpdated: "conversationUpdated",
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

export type RealtimeEventConversationCreated = {
  eventType: typeof RealtimeEventType.conversationCreated
  // Full conversation row — shape owned by @chatbotx.io/business's
  // ConversationModel; kept as `unknown` here to avoid a dependency from this
  // package (imported client-side) on the database schema package.
  data: unknown
}

export type RealtimeEventConversationUpdatedChanges = {
  archivedAt?: string | null
  assignedUserId?: string | null
  assignedInboxTeamId?: string | null
  followed?: boolean
  agentLastReadAt?: string | null
  botEnabled?: boolean
}

export type RealtimeEventConversationUpdated = {
  eventType: typeof RealtimeEventType.conversationUpdated
  data: {
    conversationIds: string[]
    changes: RealtimeEventConversationUpdatedChanges
  }
}

/**
 * Identifiers every in-app call event carries. `callId` is ALWAYS the
 * `WhatsappCall` row id; `correlationId` is the external id (`wacid`, or the
 * outbound `attemptId` until Meta assigns one); `rootUuid` is the FreeSWITCH
 * A-leg uuid, also sent to the agent's softphone as the `X-CBX-Root-UUID`
 * INVITE header so the browser can match the ringing SIP call to this event.
 */
export type RealtimeCallIdentity = {
  callId: string
  correlationId: string
  rootUuid: string
}

/**
 * A WhatsApp call is ringing on FreeSWITCH and eligible agents' softphones
 * are being invited — the inbox enriches the incoming SIP call with the
 * contact/conversation it belongs to.
 */
export type RealtimeEventWhatsappCallRinging = {
  eventType: typeof RealtimeEventType.whatsappCallRinging
  data: RealtimeCallIdentity & {
    direction: "userInitiated" | "businessInitiated"
    conversationId: string
    contactInboxId: string
    contactName?: string | null
  }
}

/** The call left FreeSWITCH (any terminal status) — dismiss call UI. */
export type RealtimeEventWhatsappCallEnded = {
  eventType: typeof RealtimeEventType.whatsappCallEnded
  data: RealtimeCallIdentity & {
    status: "completed" | "rejected" | "failed"
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
  | RealtimeEventNotifyExportResult
  | RealtimeEventConversationCreated
  | RealtimeEventConversationUpdated
  | RealtimeEventWhatsappCallRinging
  | RealtimeEventWhatsappCallEnded
