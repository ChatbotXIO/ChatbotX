import type {
  SendAudioStepSchema,
  SendCardStepSchema,
  SendCarouselStepSchema,
  SendImageStepSchema,
  SendQuickReplyStepSchema,
  SendTextStepSchema,
  SendVideoStepSchema,
} from "@aha.chat/flow-config"
import type { ConversationEntity, MessageEntity } from "@aha.chat/sdk"
import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueName } from "../../lib/types"

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
      | SendQuickReplyStepSchema
  }
}

export type ChatJobData = ChatJobSendMessage | ChatJobSendFlowStep

export const chatQueue =
  process.env.NEXT_PHASE !== "phase-production-build"
    ? new Queue<ChatJobData>(queueName.chat, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
    : fakeQueue
