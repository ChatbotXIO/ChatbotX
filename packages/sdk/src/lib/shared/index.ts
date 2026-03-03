import type { ContextQueue } from "./context"
import type { IncomingConversation, IncomingMessage } from "./message"

export * from "./context"
export * from "./message"
export * from "./mime-types"

export type Handler<I, O> = (props: I) => Promise<O>

export type BaseConfig = Record<string, unknown>

export type HandleRequestProps<IConfig extends BaseConfig> = {
  config: IConfig
  req: Request
  queue?: ContextQueue
}

export const HandleRequestType = {
  callback: "callback",
  webhook: "webhook",
  generateAuthUrl: "generate-auth-url",
} as const

export type ReceivedMessageResult = {
  message: IncomingMessage
  conversation: IncomingConversation
  postbackAction: string | null
  quickReplyAction: string | null
  ref: string | null
}
