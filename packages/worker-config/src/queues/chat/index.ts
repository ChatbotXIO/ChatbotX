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
  SendWaTemplateMessageStepSchema,
  WaTemplateParams,
} from "@chatbotx.io/flow-config"
import type { OutgoingConversation, OutgoingMessage } from "@chatbotx.io/sdk"
import { Queue } from "bullmq"
import z from "zod"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueName } from "../../lib/types"
import type { BotResponseTrackingContext } from "../types"

export const chatJobActions = z.enum([
  "sendExternalMessage",
  "sendFlowMessage",
  "sendChatMessage",
  "sendWhatsappTemplateMessage",
  "sendTyping",
])

export type ChatJobSendExternalMessage = {
  type: typeof chatJobActions.enum.sendExternalMessage
  data: {
    conversation: OutgoingConversation
    message: OutgoingMessage
  }
}

export type ChatJobSendFlowStep = {
  type: typeof chatJobActions.enum.sendFlowMessage
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
      | SendWaTemplateMessageStepSchema
    trackingContext?: BotResponseTrackingContext
  }
}

export type ChatJobSendChatMessage = {
  type: typeof chatJobActions.enum.sendChatMessage
  data: {
    conversation: OutgoingConversation
    text?: string
    url?: string
    trackingContext?: BotResponseTrackingContext
  }
}

export type ChatJobSendWhatsappTemplateMessage = {
  type: typeof chatJobActions.enum.sendWhatsappTemplateMessage
  data: {
    conversationId: string
    templateId: string
    broadcastId: string
    templateData?: WaTemplateParams
  }
}

export type ChatJobSendTyping = {
  type: typeof chatJobActions.enum.sendTyping
  data: {
    conversation: OutgoingConversation
    typing: boolean
  }
}

export type ChatJobData =
  | ChatJobSendExternalMessage
  | ChatJobSendFlowStep
  | ChatJobSendChatMessage
  | ChatJobSendWhatsappTemplateMessage
  | ChatJobSendTyping

export const chatQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<ChatJobData>(queueName.chat, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
