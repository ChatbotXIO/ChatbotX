import type {
  SendAudioStepSchema,
  SendCardStepSchema,
  SendCarouselStepSchema,
  SendFileStepSchema,
  SendGifStepSchema,
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
  sendChatMessage: "sendChatMessage",
} as const

export type ChatJobSendExternalMessage = {
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
    flowId: string
    flowVersionId?: string
    step:
      | SendTextStepSchema
      | SendImageStepSchema
      | SendGifStepSchema
      | SendFileStepSchema
      | SendVideoStepSchema
      | SendAudioStepSchema
      | SendCardStepSchema
      | SendCarouselStepSchema
      | SendQuickReplyStepSchema
  }
}

export type ChatJobSendChatMessage = {
  type: typeof ChatJobAction.sendChatMessage
  data: {
    conversationId: string
    text?: string
    url?: string
  }
}

export type ChatJobData =
  | ChatJobSendExternalMessage
  | ChatJobSendFlowStep
  | ChatJobSendChatMessage

export const chatQueue =
  process.env.NEXT_PHASE !== "phase-production-build"
    ? new Queue<ChatJobData>(queueName.chat, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
    : fakeQueue
