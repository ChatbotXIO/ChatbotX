import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import type { MetadataPayload } from "@chatbotx.io/flow-config"
import type { OutgoingMessage } from "@chatbotx.io/sdk"
import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"
import type { BotResponseTrackingContext } from "../types"

export const IntegrationJobAction = {
  sendFlow: "sendFlow",
  sendSequenceFlow: "sendSequenceFlow",
  runRef: "runRef",
  incomingMessage: "incomingMessage",
  incomingComment: "incomingComment",
  updateIncomingComment: "updateIncomingComment",
  deleteIncomingComment: "deleteIncomingComment",
  messageStatus: "messageStatus",
  runFlowPostback: "runFlowPostback",
  runFlowQuickReply: "runFlowQuickReply",
  processAutomatedResonse: "processAutomatedResponse",
  agentMarkAsRead: "agentMarkAsRead",
  contactMarkAsRead: "contactMarkAsRead",
  runChallenge: "runChallenge",
  blockContact: "blockContact",
  unblockContact: "unblockContact",
  assignConversation: "assignConversation",
  createMessage: "createMessage",
  sendEmail: "sendEmail",
  coexistWhatsappBuffer: "coexistWhatsappBuffer",
  coexistWhatsappFlush: "coexistWhatsappFlush",
  coexistMessengerSync: "coexistMessengerSync",
  coexistAttachmentDownload: "coexistAttachmentDownload",
  updateContactAvatar: "updateContactAvatar",
  channelLabelChange: "channelLabelChange",
} as const

export type IntegrationJobReceiveMessage = {
  type: typeof IntegrationJobAction.incomingMessage
  data: {
    integrationType: string
    integrationIdentifier: string
    payload: unknown
  }
}

export type IntegrationJobReceiveComment = {
  type: typeof IntegrationJobAction.incomingComment
  data: {
    integrationType: string
    integrationIdentifier: string
    commentData: {
      commentId: string
      postId: string
      parentId?: string
      fromId: string
      fromName?: string
      message?: string
      createdTime: number
    }
  }
}

export type IntegrationJobUpdateIncomingComment = {
  type: typeof IntegrationJobAction.updateIncomingComment
  data: {
    integrationType: string
    integrationIdentifier: string
    commentId: string
    newText: string
  }
}

export type IntegrationJobDeleteIncomingComment = {
  type: typeof IntegrationJobAction.deleteIncomingComment
  data: {
    integrationType: string
    integrationIdentifier: string
    commentId: string
  }
}

export type IntegrationJobMessageStatus = {
  type: typeof IntegrationJobAction.messageStatus
  data: {
    integrationType: string
    integrationIdentifier: string
    payload: {
      messageId: string
      status: "delivered" | "failed" | "read"
      timestamp: string
      error?: unknown
    }
  }
}

/**
 * Per-node execution counter carried through `sendFlow` jobs to guard against
 * infinite flow loops. Maps a node id to the number of times that node has
 * executed within one uninterrupted run; resets when the flow pauses for the user.
 */
export type NodeVisits = Record<string, number>

export type IntegrationJobRunFlowNode = {
  type: typeof IntegrationJobAction.sendFlow
  data: {
    conversationId: string | ConversationModel
    contactInboxId: string | ContactInboxModel
    flowId?: string
    flowVersionId?: string
    nodeId?: string
    startFromStepId?: string
    nodeVisits?: NodeVisits
    trackingContext?: BotResponseTrackingContext
    metadata?: MetadataPayload
    sendFrom?: "inbox"
  }
}

export type IntegrationJobSendFlowPostback = {
  type: typeof IntegrationJobAction.runFlowPostback
  data: {
    conversationId: string | ConversationModel
    contactInboxId: string | ContactInboxModel
    action: string
    ref?: string | null
    webhookType?: string
    messageId?: string
    payload?: {
      waFlowResponse?: Record<string, unknown> | string
    }
  }
}

export type IntegrationJobSendFlowQuickReply = {
  type: typeof IntegrationJobAction.runFlowQuickReply
  data: {
    conversationId: string | ConversationModel
    contactInboxId: string | ContactInboxModel
    action: string
    ref?: string | null
    inboxId?: string
    webhookType?: string
    messageId?: string
  }
}

export type IntegrationJobProcessAutomatedResponse = {
  type: typeof IntegrationJobAction.processAutomatedResonse
  data: {
    conversationId: string | ConversationModel
    contactInboxId: string | ContactInboxModel
    messageId: string
  }
}

export type IntegrationJobAgentMarkAsRead = {
  type: typeof IntegrationJobAction.agentMarkAsRead
  data: {
    conversationId: string | ConversationModel
  }
}

export type IntegrationJobContactMarkAsRead = {
  type: typeof IntegrationJobAction.contactMarkAsRead
  data: {
    integrationType: string
    integrationIdentifier: string
    sourceConversationId: string
    payload: unknown
  }
}

export type IntegrationJobRunRef = {
  type: typeof IntegrationJobAction.runRef
  data: {
    conversationId: string | ConversationModel
    contactInboxId: string | ContactInboxModel
    ref: string
    messageId?: string
  }
}

export type IntegrationJobRunChallenge = {
  type: typeof IntegrationJobAction.runChallenge
  data: {
    conversationId: string | ConversationModel
    contactInboxId: string | ContactInboxModel
    messageId?: string
    challenge: {
      type: "step"
      data: {
        flowId: string
        flowVersionId?: string
        nodeId: string
        stepId: string
        attempts: number
        lastAttemptAt: Date
      }
    }
  }
}

export type IntegrationJobCreateMessage = {
  type: typeof IntegrationJobAction.createMessage
  data: {
    message: OutgoingMessage
  }
}

export type IntegrationJobSendSequenceFlow = {
  type: typeof IntegrationJobAction.sendSequenceFlow
  data: {
    dispatchId: string
    workspaceId: string
    stepId: string
    contactId: string
    contactInboxId: string
    enrollmentId: string
    sequenceId: string
    bucket: number
    metadata: MetadataPayload
  }
}

/** Buffers a raw WhatsApp Coexistence history payload into the staging table. */
export type IntegrationJobCoexistWhatsappBuffer = {
  type: typeof IntegrationJobAction.coexistWhatsappBuffer
  data: {
    phoneNumberId: string
    payload: unknown
  }
}

export type IntegrationJobChannelLabelChange = {
  type: typeof IntegrationJobAction.channelLabelChange
  data:
    | {
        integrationType: "messenger"
        integrationIdentifier: string
        payload: unknown
      }
    | {
        integrationType: "zalo"
        integrationIdentifier: string
        payload: unknown
      }
}

/**
 * Flushes buffered WhatsApp staging rows into Contact/Message once enabled.
 * `runId` is optional: the buffer (webhook-driven) omits it and the flush
 * handler looks up the live run by phoneNumberId. Scheduler + self-continuation
 * keep passing the explicit runId so they stay pinned to a specific run.
 */
export type IntegrationJobCoexistWhatsappFlush = {
  type: typeof IntegrationJobAction.coexistWhatsappFlush
  data: {
    runId?: string
    phoneNumberId: string
  }
}

/** Pulls historical Messenger conversations/messages via the Graph API. */
export type IntegrationJobCoexistMessengerSync = {
  type: typeof IntegrationJobAction.coexistMessengerSync
  data: {
    runId: string
    integrationId: string
    workspaceId: string
  }
}

/**
 * Downloads a Coexist attachment's bytes from the channel API (Facebook URL
 * for Messenger; WhatsApp media-id for WhatsApp — both encoded into
 * `Attachment.originPath` by the historical importer), uploads to object
 * storage, and UPDATEs the row with the resulting S3 path. Dispatched per
 * attachment after `bulkImportMessages` inserts the placeholder row.
 *
 * Idempotency: jobId `att-${attachmentId}` dedups concurrent enqueues; the
 * handler additionally checks the originPath prefix to no-op on retries
 * where a prior worker already finished the upload.
 */
export type IntegrationJobCoexistAttachmentDownload = {
  type: typeof IntegrationJobAction.coexistAttachmentDownload
  data: {
    attachmentId: string
    workspaceId: string
    channel: "messenger" | "whatsapp"
    integrationId: string
  }
}

/**
 * Fetches a contact's profile picture from the channel's Graph/API, mirrors
 * the bytes to our object storage, and persists the storage path on the
 * Contact row. Dispatched per-contact after Coexist historical sync upserts
 * contacts (which only carry name/sourceId, not avatar).
 */
export type IntegrationJobUpdateContactAvatar = {
  type: typeof IntegrationJobAction.updateContactAvatar
  data: {
    workspaceId: string
    contactInboxId: string
    sourceId: string
  }
}

export type IntegrationJobData =
  | IntegrationJobReceiveMessage
  | IntegrationJobReceiveComment
  | IntegrationJobUpdateIncomingComment
  | IntegrationJobDeleteIncomingComment
  | IntegrationJobMessageStatus
  | IntegrationJobRunFlowNode
  | IntegrationJobSendFlowPostback
  | IntegrationJobSendFlowQuickReply
  | IntegrationJobAgentMarkAsRead
  | IntegrationJobContactMarkAsRead
  | IntegrationJobRunRef
  | IntegrationJobRunChallenge
  | IntegrationJobCreateMessage
  | IntegrationJobProcessAutomatedResponse
  | IntegrationJobSendSequenceFlow
  | IntegrationJobCoexistWhatsappBuffer
  | IntegrationJobCoexistWhatsappFlush
  | IntegrationJobCoexistMessengerSync
  | IntegrationJobCoexistAttachmentDownload
  | IntegrationJobUpdateContactAvatar
  | IntegrationJobChannelLabelChange

export const integrationQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<IntegrationJobData>(queueNames.enum.integration, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
