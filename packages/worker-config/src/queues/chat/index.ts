import type {
  SendAudioStepSchema,
  SendCardStepSchema,
  SendCarouselStepSchema,
  SendImageStepSchema,
  SendTextStepSchema,
  SendVideoStepSchema,
} from "@aha.chat/flow-config"
import type { ConversationEntity, MessageEntity } from "@aha.chat/sdk"
import { Queue } from "bullmq"
import { defaultJobOptions, getRedisConnection } from "../../lib/connection"
import { QueueName } from "../../lib/types"

export const ChatJobAction = {
  SEND_EXTERNAL_MESSAGE: "SEND_EXTERNAL_MESSAGE",
  SEND_FLOW_STEP: "SEND_FLOW_STEP",
} as const

export type ChatJobSendMessage = {
  type: typeof ChatJobAction.SEND_EXTERNAL_MESSAGE
  data: {
    conversation: ConversationEntity
    message: MessageEntity
  }
}

export type ChatJobSendFlowStep = {
  type: typeof ChatJobAction.SEND_FLOW_STEP
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
  connection: getRedisConnection(),
  defaultJobOptions,
})
