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
import type { OutgoingConversation, OutgoingMessage } from "@aha.chat/sdk"
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
  sendTyping: "sendTyping",
  notifyExportResult: "notifyExportResult",
} as const

export type ChatJobSendExternalMessage = {
  type: typeof ChatJobAction.sendExternalMessage
  data: {
    conversation: OutgoingConversation
    message: OutgoingMessage
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
    conversation: OutgoingConversation
    text?: string
    url?: string
  }
}

export type ChatJobSendTyping = {
  type: typeof ChatJobAction.sendTyping
  data: {
    conversation: OutgoingConversation
    typing: boolean
  }
}

export type ChatJobNotifyExportResult = {
  type: typeof ChatJobAction.notifyExportResult
  data: {
    chatbotId: string
    userId: string
    status: "pending" | "completed" | "failed"
    outputPath: string
  }
}

export type ChatJobData =
  | ChatJobSendExternalMessage
  | ChatJobSendFlowStep
  | ChatJobSendChatMessage
  | ChatJobSendTyping
  | ChatJobNotifyExportResult

export const chatQueue =
  process.env.NEXT_PHASE !== "phase-production-build"
    ? new Queue<ChatJobData>(queueName.chat, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
    : fakeQueue
