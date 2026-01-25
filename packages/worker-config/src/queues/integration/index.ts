import type { OutgoingMessageEntity } from "@aha.chat/sdk"
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
  readMessage: "readMessage",
  runChallenge: "runChallenge",
} as const

export type IntegrationJobReceiveMessage = {
  type: typeof IntegrationJobAction.incomingMessage
  data: {
    integrationType: string
    // biome-ignore lint/suspicious/noExplicitAny: wip
    payload: any
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
    message: OutgoingMessageEntity
  }
}

export type IntegrationJobSendBroadcast = {
  type: typeof IntegrationJobAction.sendBroadcast
  data: {
    broadcastId: string
  }
}

export type IntegrationJobReadMessage = {
  type: typeof IntegrationJobAction.readMessage
  data: {
    integrationType: string
    // biome-ignore lint/suspicious/noExplicitAny: wip
    payload: any
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

export type IntegrationJobData =
  | IntegrationJobReceiveMessage
  | IntegrationJobRunFlowNode
  | IntegrationJobSendFlowPostback
  | IntegrationJobSendFlowQuickReply
  | IntegrationJobTriggerAutomatedResponse
  | IntegrationJobSendBroadcast
  | IntegrationJobReadMessage
  | IntegrationJobRunRef
  | IntegrationJobRunChallenge

export const integrationQueue =
  process.env.NEXT_PHASE !== "phase-production-build"
    ? new Queue<IntegrationJobData>(queueName.integration, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
    : fakeQueue
