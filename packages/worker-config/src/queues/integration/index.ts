import type {
  ContactModel,
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
import { queueName } from "../../lib/types"
import type { BotResponseTrackingContext } from "../types"

export const IntegrationJobAction = {
  sendFlow: "sendFlow",
  runRef: "runRef",
  incomingMessage: "incomingMessage",
  messageStatus: "messageStatus",
  runFlowPostback: "runFlowPostback",
  runFlowQuickReply: "runFlowQuickReply",
  processAutomatedResonse: "processAutomatedResponse",
  sendBroadcast: "sendBroadcast",
  agentMarkAsRead: "agentMarkAsRead",
  contactMarkAsRead: "contactMarkAsRead",
  runChallenge: "runChallenge",
  blockContact: "blockContact",
  unblockContact: "unblockContact",
  assignConversation: "assignConversation",
  createMessage: "createMessage",
  referral: "referral",
} as const

export type IntegrationJobReceiveMessage = {
  type: typeof IntegrationJobAction.incomingMessage
  data: {
    integrationType: string
    integrationIdentifier: string
    payload: unknown
  }
}

export type IntegrationJobMessageStatus = {
  type: typeof IntegrationJobAction.messageStatus
  data: {
    integrationType: string
    integrationIdentifier: string
    payload: {
      messageId: string
      status: "delivered" | "failed"
      timestamp: string
    }
  }
}

export type IntegrationJobRunFlowNode = {
  type: typeof IntegrationJobAction.sendFlow
  data: {
    conversationId: string
    contactInboxId?: string
    flowId?: string
    flowVersionId?: string
    nodeId?: string
    trackingContext?: BotResponseTrackingContext
    metadata?: MetadataPayload
  }
}

export type IntegrationJobSendFlowPostback = {
  type: typeof IntegrationJobAction.runFlowPostback
  data: {
    conversationId: string
    action: string
    ref?: string | null
    inboxId?: string
    webhookType?: string
  }
}

export type IntegrationJobSendFlowQuickReply = {
  type: typeof IntegrationJobAction.runFlowQuickReply
  data: {
    conversationId: string
    action: string
    ref?: string | null
    inboxId?: string
    webhookType?: string
  }
}

export type IntegrationJobProcessAutomatedResponse = {
  type: typeof IntegrationJobAction.processAutomatedResonse
  data: {
    conversationId: string
    contactInboxId: string
  }
}

export type IntegrationJobSendBroadcast = {
  type: typeof IntegrationJobAction.sendBroadcast
  data: {
    broadcastId: string
  }
}

export type IntegrationJobAgentMarkAsRead = {
  type: typeof IntegrationJobAction.agentMarkAsRead
  data: {
    conversation: ConversationModel
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

export type IntegrationJobReferral = {
  type: typeof IntegrationJobAction.referral
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
    conversationId: string
    ref: string
  }
}

export type IntegrationJobRunChallenge = {
  type: typeof IntegrationJobAction.runChallenge
  data: {
    conversationId: string
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

export type IntegrationJobBlockContact = {
  type: typeof IntegrationJobAction.blockContact
  data: {
    contact: ContactModel
  }
}

export type IntegrationJobUnblockContact = {
  type: typeof IntegrationJobAction.unblockContact
  data: {
    contact: ContactModel
  }
}

export type IntegrationJobAssignConversation = {
  type: typeof IntegrationJobAction.assignConversation
  data: {
    conversations: ConversationModel[]
  }
}

export type IntegrationJobCreateMessage = {
  type: typeof IntegrationJobAction.createMessage
  data: {
    message: OutgoingMessage
  }
}

export type IntegrationJobData =
  | IntegrationJobReceiveMessage
  | IntegrationJobMessageStatus
  | IntegrationJobRunFlowNode
  | IntegrationJobSendFlowPostback
  | IntegrationJobSendFlowQuickReply
  | IntegrationJobSendBroadcast
  | IntegrationJobAgentMarkAsRead
  | IntegrationJobContactMarkAsRead
  | IntegrationJobRunRef
  | IntegrationJobRunChallenge
  | IntegrationJobBlockContact
  | IntegrationJobUnblockContact
  | IntegrationJobAssignConversation
  | IntegrationJobCreateMessage
  | IntegrationJobProcessAutomatedResponse
  | IntegrationJobReferral

export const integrationQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<IntegrationJobData>(queueName.integration, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
