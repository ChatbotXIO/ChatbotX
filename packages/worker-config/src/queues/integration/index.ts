import { Queue } from "bullmq"
import { connection, defaultJobOptions } from "../../lib/connection"
import { QueueName } from "../../lib/types"

export enum IntegrationJobAction {
  SEND_FLOW = "SEND_FLOW",
  RECEIVE_MESSAGE = "RECEIVE_MESSAGE",
  SEND_FLOW_POSTBACK = "SEND_FLOW_POSTBACK",
}

export type IntegrationJobReceiveMessage = {
  type: IntegrationJobAction.RECEIVE_MESSAGE
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  data: any
}

export type IntegrationJobSendFlow = {
  type: IntegrationJobAction.SEND_FLOW
  data: {
    conversationId: string
    flowId?: string
    flowVersionId?: string
    nodeId?: string
  }
}

export type IntegrationJobSendFlowPostback = {
  type: IntegrationJobAction.SEND_FLOW_POSTBACK
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
    connection,
    defaultJobOptions,
  },
)
