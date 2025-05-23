import type {
  SendImageStepSchema,
  SendTextStepSchema,
} from "@ahachat.ai/flow-config"
import type { BaseAuthValue } from "./auth"
import type { Context, ConversationEntity, MessageEntity } from "./shared"

export type SendMessageProps<TAuth extends BaseAuthValue> = {
  ctx: Context<TAuth>
  conversation: ConversationEntity
  message: MessageEntity
}

export type SendFlowStepData = SendTextStepSchema | SendImageStepSchema

export type SendFlowStepProps<TAuth extends BaseAuthValue> = {
  ctx: Context<TAuth>
  conversation: ConversationEntity
  flowVersionId: string
  step: SendFlowStepData
}
