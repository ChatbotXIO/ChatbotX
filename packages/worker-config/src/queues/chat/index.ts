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
  sendExternalMessage: "sendExternalMessage",
  sendFlowMessage: "sendFlowMessage",
} as const

export type ChatJobSendMessage = {
  type: typeof ChatJobAction.sendExternalMessage
  data: {
    conversation: ConversationEntity
    message: MessageEntity
  }
}

export type ChatJobSendFlowStep = {
  type: typeof ChatJobAction.sendFlowMessage
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

export const chatQueue = new Queue<ChatJobData>(QueueName.chat, {
  connection: getRedisConnection(),
  defaultJobOptions,
})
