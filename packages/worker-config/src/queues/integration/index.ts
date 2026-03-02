import type { ContactModel, ConversationModel } from "@aha.chat/database/types"
import type { OutgoingConversation, OutgoingMessage } from "@aha.chat/sdk"
import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueName } from "../../lib/types"

export const IntegrationJobAction = {
  sendFlow: "sendFlow",
  runRef: "runRef",
  incomingMessage: "incomingMessage",
  runFlowPostback: "runFlowPostback",
  runFlowQuickReply: "runFlowQuickReply",
  triggerAutomatedResponse: "triggerAutomatedResponse",
  sendBroadcast: "sendBroadcast",
  agentMarkAsRead: "agentMarkAsRead",
  contactMarkAsRead: "contactMarkAsRead",
  runChallenge: "runChallenge",
  blockContact: "blockContact",
  unblockContact: "unblockContact",
  assignConversation: "assignConversation",
  createMessage: "createMessage",
} as const

export type IntegrationJobReceiveMessage = {
  type: typeof IntegrationJobAction.incomingMessage
  data: {
    integrationType: string
    integrationIdentifier: string
    sourceContactId: string
    sourceConversationId: string
    payload: unknown
  }
}

export type IntegrationJobRunFlowNode = {
  type: typeof IntegrationJobAction.sendFlow
  data: {
    conversationId: string
    flowId: string
    flowVersionId?: string
    nodeId?: string
  }
}

export type IntegrationJobSendFlowPostback = {
  type: typeof IntegrationJobAction.runFlowPostback
  data: {
    conversationId: string
    action: string
    ref?: string | null
  }
}

export type IntegrationJobSendFlowQuickReply = {
  type: typeof IntegrationJobAction.runFlowQuickReply
  data: {
    conversationId: string
    action: string
    ref?: string | null
  }
}

export type IntegrationJobTriggerAutomatedResponse = {
  type: typeof IntegrationJobAction.triggerAutomatedResponse
  data: {
    message: OutgoingMessage
    conversation: OutgoingConversation
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
    conversation: OutgoingConversation
  }
}

export type IntegrationJobContactMarkAsRead = {
  type: typeof IntegrationJobAction.contactMarkAsRead
  data: {
    integrationType: string
    integrationIdentifier: string
    sourceContactId: string
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
  | IntegrationJobRunFlowNode
  | IntegrationJobSendFlowPostback
  | IntegrationJobSendFlowQuickReply
  | IntegrationJobTriggerAutomatedResponse
  | IntegrationJobSendBroadcast
  | IntegrationJobAgentMarkAsRead
  | IntegrationJobContactMarkAsRead
  | IntegrationJobRunRef
  | IntegrationJobRunChallenge
  | IntegrationJobBlockContact
  | IntegrationJobUnblockContact
  | IntegrationJobAssignConversation
  | IntegrationJobCreateMessage

export const integrationQueue =
  process.env.NEXT_PHASE !== "phase-production-build"
    ? new Queue<IntegrationJobData>(queueName.integration, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
    : fakeQueue
