import type {
  SendAudioStepSchema,
  SendCarouselStepSchema,
  SendFileStepSchema,
  SendGifStepSchema,
  SendImageStepSchema,
  SendQuickReplyStepSchema,
  SendTextStepSchema,
  SendVideoStepSchema,
} from "@aha.chat/flow-config"
import type { BaseAuthValue } from "./auth"
import type { Context, ConversationEntity, MessageEntity } from "./shared"

export type SendMessageProps<TAuth extends BaseAuthValue> = {
  ctx: Context<TAuth>
  conversation: ConversationEntity
  message: MessageEntity
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

export type SendFlowStepProps<
  TAuth extends BaseAuthValue,
  S = SendFlowStepData,
> = {
  ctx: Context<TAuth>
  conversation: ConversationEntity
  flowId: string
  flowVersionId?: string
  step: S
}
