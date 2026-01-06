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
  incomingMessage: "incomingMessage",
  sendFlowPostback: "sendFlowPostback",
  sendFlowQuickReply: "sendFlowQuickReply",
  triggerAutomatedResponse: "triggerAutomatedResponse",
  sendBroadcast: "sendBroadcast",
  readMessage: "readMessage",
} as const

export type IntegrationJobReceiveMessage = {
  type: typeof IntegrationJobAction.incomingMessage
  data: {
    integrationType: string
    // biome-ignore lint/suspicious/noExplicitAny: wip
    payload: any
  }
}

export type IntegrationJobSendFlow = {
  type: typeof IntegrationJobAction.sendFlow
  data: {
    conversationId: string
    flowId?: string
    flowVersionId?: string
    nodeId?: string
  }
}

export type IntegrationJobSendFlowPostback = {
  type: typeof IntegrationJobAction.sendFlowPostback
  data: {
    conversationId: string
    flowVersionId: string
    buttonId: string
  }
}

export type IntegrationJobSendFlowQuickReply = {
  type: typeof IntegrationJobAction.sendFlowQuickReply
  data: {
    conversationId: string
    flowVersionId: string
    buttonId: string
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

export type IntegrationJobData =
  | IntegrationJobReceiveMessage
  | IntegrationJobSendFlow
  | IntegrationJobSendFlowPostback
  | IntegrationJobSendFlowQuickReply
  | IntegrationJobTriggerAutomatedResponse
  | IntegrationJobSendBroadcast
  | IntegrationJobReadMessage

export const integrationQueue =
  process.env.NEXT_PHASE !== "phase-production-build"
    ? new Queue<IntegrationJobData>(queueName.integration, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
    : fakeQueue
