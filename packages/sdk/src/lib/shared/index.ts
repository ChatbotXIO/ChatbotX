import type { ContextQueue } from "./context"
import type { IncomingContact, IncomingMessage } from "./message"

export * from "./context"
export * from "./message"
export * from "./meta-messaging"
export * from "./mime-types"
export * from "./profile-fields"

export type Handler<I, O> = (props: I) => Promise<O>

export type BaseConfig = Record<string, unknown>

export type HandleRequestProps<IConfig extends BaseConfig> = {
  config: IConfig
  req: Request
  queue?: ContextQueue
}

export type ReceivedMessageProps = {
  integrationType: string
  integrationIdentifier: string
  payload: unknown
}

export const HandleRequestType = {
  callback: "callback",
  webhook: "webhook",
  generateAuthUrl: "generate-auth-url",
} as const

export type MessageReferral = {
  ref?: string | null
  source?: string | null
  type?: string | null
  adId?: string | null
  adTitle?: string | null
  sourceUrl?: string | null
  sourcePlatform?: string | null
  ctwaClid?: string | null
  postId?: string | null
  photoUrl?: string | null
  videoUrl?: string | null
  productId?: string | null
  flowId?: string | null
  raw?: Record<string, unknown>
}

export type ReceivedMessageResult = {
  message: IncomingMessage | null
  contact: IncomingContact
  postbackAction: string | null
  quickReplyAction: string | null
  ref: string | null
  referralSource?: string | null
  referral?: MessageReferral | null
  buttonTitle?: string | null
}
