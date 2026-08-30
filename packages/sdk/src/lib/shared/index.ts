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
  /**
   * Optional handle to the workload-class `heavy` queue (long-lock,
   * throughput-oriented, latency-tolerant jobs — see
   * docs/plans/2026-08-30-heavy-worker-coexist-split.md). Generic — not
   * channel-specific — so any integration can route its own heavy jobs here;
   * today only the WhatsApp integration's coexist buffer enqueue consumes it.
   */
  heavyQueue?: ContextQueue
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
  templateFlowToken?: string | null
  quickReplyAction: string | null
  ref: string | null
  referralSource?: string | null
  referral?: MessageReferral | null
  buttonTitle?: string | null
}

/**
 * Present only for a flow run triggered by a Facebook comment-automation
 * public or private reply. Carries the triggering comment's id so the first
 * outgoing message of the run is delivered as a reply to that specific
 * comment instead of a normal flow message. Forwarded across every
 * re-enqueued sendFlow job until consumed by the first message-producing
 * step, then dropped.
 *
 * `replyChannel` picks the delivery mechanism for that first message:
 * - `"public"`: post it as a public comment reply (`comment.sendComment`),
 *   same as the `text`/`AIAgent` public reply types. Works on any channel
 *   that implements `sendComment` (Messenger, Instagram).
 * - `"private"`: send it via Meta's comment_id-anchored Send API
 *   (bypasses the normal messaging-window rule) instead of the standard
 *   PSID-based send, which Meta rejects for users who only commented and
 *   never messaged the Page. Supported on Messenger and Instagram (both
 *   Instagram Login and Instagram-via-Facebook variants).
 */
export type CommentAnchor = {
  commentId: string
  replyChannel: "public" | "private"
}
