import type {
  ContactInboxModel,
  ConversationModel,
  MessageModel,
} from "@chatbotx.io/database/types"
import type {
  MessengerTemplateParams,
  MetadataPayload,
  SendAudioStepSchema,
  SendCardStepSchema,
  SendCarouselStepSchema,
  SendFileStepSchema,
  SendGifStepSchema,
  SendImageStepSchema,
  SendMessengerTemplateMessageStepSchema,
  SendQuickReplyStepSchema,
  SendTextStepSchema,
  SendVideoStepSchema,
  SendWaTemplateMessageStepSchema,
  WaTemplateParams,
} from "@chatbotx.io/flow-config"
import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"
import type { BotResponseTrackingContext } from "../types"

export const ChatJobAction = {
  sendChannelMessage: "sendChannelMessage",
  sendFlowMessage: "sendFlowMessage",
  sendChatMessage: "sendChatMessage",
  sendWhatsappTemplateMessage: "sendWhatsappTemplateMessage",
  sendMessengerTemplateMessage: "sendMessengerTemplateMessage",
  sendTyping: "sendTyping",
  notifyExportResult: "notifyExportResult",
  broadcastEvent: "broadcastEvent",
} as const

export type ChatJobSendChannelMessage = {
  type: typeof ChatJobAction.sendChannelMessage
  data: {
    conversation: ConversationModel
    contactInbox: ContactInboxModel
    message: MessageModel & { clientId?: string | undefined }
    metadata?: MetadataPayload
    sendFrom?: "inbox"
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
      | SendWaTemplateMessageStepSchema
      | SendMessengerTemplateMessageStepSchema
    trackingContext?: BotResponseTrackingContext
    metadata?: MetadataPayload
    sendFrom?: "inbox"
  }
}

export type ChatJobSendChatMessage = {
  type: typeof ChatJobAction.sendChatMessage
  data: {
    conversation: ConversationModel
    contactInbox?: ContactInboxModel
    text?: string
    url?: string
    storagePath?: string
    trackingContext?: BotResponseTrackingContext
    metadata?: MetadataPayload
  }
}

export type ChatJobSendWhatsappTemplateMessage = {
  type: typeof ChatJobAction.sendWhatsappTemplateMessage
  data: {
    conversation: ConversationModel
    contactInbox: ContactInboxModel
    templateId: string
    broadcastId: string
    templateData?: WaTemplateParams
    metadata?: MetadataPayload
  }
}

export type ChatJobSendMessengerTemplateMessage = {
  type: typeof ChatJobAction.sendMessengerTemplateMessage
  data: {
    conversation: ConversationModel
    contactInbox: ContactInboxModel
    templateId: string
    broadcastId: string
    templateData?: MessengerTemplateParams
    // Separate from templateData — create-broadcast.action previously stored
    // buttons inside templateData causing a type lie. Now explicitly typed.
    buttons?: Array<{ id: string; label: string; flowId?: string }>
    metadata?: MetadataPayload
  }
}

export type ChatJobSendTyping = {
  type: typeof ChatJobAction.sendTyping
  data: {
    conversation: ConversationModel
    contactInbox: ContactInboxModel
    typing: boolean
    seconds?: number
    metadata?: MetadataPayload
  }
}

export type ChatJobBroadcastEvent = {
  type: typeof ChatJobAction.broadcastEvent
  data: {
    workspaceId: string
    event: unknown
  }
}

export type ChatJobNotifyExportResult = {
  type: typeof ChatJobAction.notifyExportResult
  data: Record<string, unknown>
}

export type ChatJobData =
  | ChatJobSendChannelMessage
  | ChatJobSendFlowStep
  | ChatJobSendChatMessage
  | ChatJobSendWhatsappTemplateMessage
  | ChatJobSendMessengerTemplateMessage
  | ChatJobSendTyping
  | ChatJobBroadcastEvent
  | ChatJobNotifyExportResult

export const chatQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<ChatJobData>(queueNames.enum.chat, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
