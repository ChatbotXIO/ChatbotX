import type { ConversationEntity, MessageEntity } from "@ahachat.ai/sdk"
import { Queue } from "bullmq"
import { connection, defaultJobOptions } from "../../lib/connection"
import { QueueName } from "../../lib/types"
import type {
  SendAudioStepSchema,
  SendCardStepSchema,
  SendCarouselStepSchema,
  SendImageStepSchema,
  SendTextStepSchema,
  SendVideoStepSchema,
} from "@ahachat.ai/flow-config"

export enum ChatJobAction {
  SEND_MESSAGE = "SEND_MESSAGE",
  SEND_FLOW_STEP = "SEND_FLOW_STEP",
}

export type ChatJobSendMessage = {
  type: ChatJobAction.SEND_MESSAGE
  data: {
    conversation: ConversationEntity
    message: MessageEntity
  }
}

export type ChatJobSendFlowStep = {
  type: ChatJobAction.SEND_FLOW_STEP
  data: {
    conversationId: string
    flowVersionId: string
    step:
      | SendTextStepSchema
      | SendImageStepSchema
      | SendVideoStepSchema
      | SendAudioStepSchema
      | SendCardStepSchema
      | SendCarouselStepSchema
  }
}

export type ChatJobData = ChatJobSendMessage | ChatJobSendFlowStep

export const chatQueue = new Queue<ChatJobData>(QueueName.CHAT, {
  connection,
  defaultJobOptions,
})
