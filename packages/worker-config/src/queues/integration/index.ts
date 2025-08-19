import { Queue } from "bullmq"
import { defaultJobOptions, getRedisConnection } from "../../lib/connection"
import { QueueName } from "../../lib/types"

export const IntegrationJobAction = {
  SEND_FLOW: "SEND_FLOW",
  RECEIVE_MESSAGE: "RECEIVE_MESSAGE",
  SEND_FLOW_POSTBACK: "SEND_FLOW_POSTBACK",
} as const

export type IntegrationJobReceiveMessage = {
  type: typeof IntegrationJobAction.RECEIVE_MESSAGE
  // biome-ignore lint/suspicious/noExplicitAny: wip
  data: any
}

export type IntegrationJobSendFlow = {
  type: typeof IntegrationJobAction.SEND_FLOW
  data: {
    conversationId: string
    flowId?: string
    flowVersionId?: string
    nodeId?: string
  }
}

export type IntegrationJobSendFlowPostback = {
  type: typeof IntegrationJobAction.SEND_FLOW_POSTBACK
  data: {
    conversationId: string
    flowVersionId: string
    buttonId: string
  }
}

export type IntegrationJobData =
  | IntegrationJobReceiveMessage
  | IntegrationJobSendFlow
  | IntegrationJobSendFlowPostback

export const integrationQueue = new Queue<IntegrationJobData>(
  QueueName.INTEGRATION,
  {
    connection: getRedisConnection(),
    defaultJobOptions,
  },
)
