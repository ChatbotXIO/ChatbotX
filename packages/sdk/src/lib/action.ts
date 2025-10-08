import type {
  SendAudioStepSchema,
  SendFileStepSchema,
  SendImageStepSchema,
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
  | SendAudioStepSchema
  | SendVideoStepSchema
  | SendFileStepSchema

export type SendFlowStepProps<TAuth extends BaseAuthValue> = {
  ctx: Context<TAuth>
  conversation: ConversationEntity
  flowVersionId: string
  step: SendFlowStepData
}
