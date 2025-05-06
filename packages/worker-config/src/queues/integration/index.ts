import { Queue } from "bullmq"
import { connection, defaultJobOptions } from "../../lib/connection"
import { QueueName } from "../../lib/types"

export enum IntegrationJobAction {
  SEND_MESSAGE = "SEND_MESSAGE",
  SEND_FLOW = "SEND_FLOW",
  SEND_FLOW_STEP = "SEND_FLOW_STEP",
  RECEIVE_MESSAGE = "RECEIVE_MESSAGE",
}

type IntegrationJobReceiveMessage = {
  type: IntegrationJobAction.RECEIVE_MESSAGE
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  data: any
}

type IntegrationJobSendFlow = {
  type: IntegrationJobAction.SEND_FLOW
  data: {
    conversationId: string
    flowId: string
  }
}

export type IntegrationJobData =
  | IntegrationJobReceiveMessage
  | IntegrationJobSendFlow

export const integrationQueue = new Queue<IntegrationJobData>(
  QueueName.INTEGRATION,
  {
    connection,
    defaultJobOptions,
  },
)
