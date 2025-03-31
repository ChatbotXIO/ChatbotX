import type { BaseAuthValue } from "./auth"
import type { Context, ConversationEntity, MessageEntity } from "./shared"

export type SendMessageProps<TAuth extends BaseAuthValue> = {
  ctx: Context<TAuth>
  conversation: ConversationEntity
  message: MessageEntity
}
