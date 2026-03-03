import type {
  SendAudioStepSchema,
  SendCarouselStepSchema,
  SendFileStepSchema,
  SendGifStepSchema,
  SendImageStepSchema,
  SendQuickReplyStepSchema,
  SendTextStepSchema,
  SendVideoStepSchema,
  SendWaTemplateMessageStepSchema,
} from "@aha.chat/flow-config"
import type { AuthValue } from "./auth"
import type {
  Context,
  OutgoingContact,
  OutgoingConversation,
  OutgoingMessage,
} from "./shared"

export type SendMessageProps<TAuth extends AuthValue> = {
  ctx: Context<TAuth>
  data: {
    contact: OutgoingContact
    conversation: OutgoingConversation
    message: OutgoingMessage
  }
}

export type SendTypingProps<TAuth extends AuthValue> = {
  ctx: Context<TAuth>
  data: {
    conversation: OutgoingConversation
    typing: boolean
  }
}

export type AgentMarkAsReadProps<TAuth extends AuthValue> = {
  ctx: Context<TAuth>
  data: {
    conversation: OutgoingConversation
  }
}

export type ContactMarkAsReadProps<TAuth extends AuthValue> = {
  ctx: Context<TAuth>
  data: {
    payload: unknown
  }
}

export type BlockContactProps<TAuth extends AuthValue> = {
  ctx: Context<TAuth>
  data: {
    contact: OutgoingContact
  }
}

export type SendFlowStepData =
  | SendTextStepSchema
  | SendImageStepSchema
  | SendGifStepSchema
  | SendAudioStepSchema
  | SendVideoStepSchema
  | SendFileStepSchema
  | SendQuickReplyStepSchema
  | SendCarouselStepSchema
  | SendWaTemplateMessageStepSchema

export type SendFlowStepProps<TAuth extends AuthValue, S = SendFlowStepData> = {
  ctx: Context<TAuth>
  data: {
    contact: OutgoingContact
    conversation: OutgoingConversation
    flowId: string
    flowVersionId?: string
    step: S
  }
}
