import type { OutgoingMessageEntity } from "@aha.chat/sdk"
import { Queue } from "bullmq"
import { defaultJobOptions, getRedisConnection } from "../../lib/connection"
import { QueueName } from "../../lib/types"

export const IntegrationJobAction = {
  sendFlow: "sendFlow",
  incomingMessage: "incomingMessage",
  sendFlowPostback: "sendFlowPostback",
  triggerAutomatedResponse: "triggerAutomatedResponse",
  sendBroadcast: "sendBroadcast",
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

export type IntegrationJobData =
  | IntegrationJobReceiveMessage
  | IntegrationJobSendFlow
  | IntegrationJobSendFlowPostback
  | IntegrationJobTriggerAutomatedResponse
  | IntegrationJobSendBroadcast

export const integrationQueue = new Queue<IntegrationJobData>(
  QueueName.integration,
  {
    connection: getRedisConnection(),
    defaultJobOptions,
  },
)
