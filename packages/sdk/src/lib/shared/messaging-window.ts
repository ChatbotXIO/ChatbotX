import { type ChannelType, channelTypes } from "@chatbotx.io/utils/channel"
import { isManualSend, type SendFrom } from "@chatbotx.io/utils/send-from"
import { ChannelError } from "../channel-error"
import { ChannelErrorCategory } from "../channel-error-codes"
import {
  META_HUMAN_AGENT_WINDOW_MS,
  META_RESPONSE_WINDOW_MS,
  normalizeLastIncomingMessageAt,
} from "./meta-messaging"

/** TikTok Business Messaging: a business may reply for 48h after the user's last message. */
export const TIKTOK_REPLY_WINDOW_MS = 48 * 60 * 60 * 1000

export type MessagingWindowState =
  /** Inside the standard window. */
  | "open"
  /** Meta only: past 24h, within 7 days — send with the HUMAN_AGENT tag. */
  | "humanAgent"
  /** No free-form manual message (WhatsApp: template only). */
  | "closed"
  /** The channel has no messaging window. */
  | "unlimited"
  /** Comment conversation: the window does not apply. */
  | "notApplicable"
  /** The contact's last incoming message is unknown. */
  | "unknown"

export interface MessagingWindow {
  /** Next moment the state changes (open → humanAgent / closed); null if it never does. */
  changesAt: Date | null
  /** Absolute moment the window closes for good; null if it does not close. */
  closesAt: Date | null
  state: MessagingWindowState
}

interface ChannelWindowPolicy {
  humanAgentMs?: number
  standardMs: number
}

/**
 * Per-channel manual-send window. `Record<ChannelType, …>` so a new channel
 * cannot be added without deciding its window.
 */
export const MESSAGING_WINDOW_POLICY: Record<
  ChannelType,
  ChannelWindowPolicy | null
> = {
  messenger: {
    standardMs: META_RESPONSE_WINDOW_MS,
    humanAgentMs: META_HUMAN_AGENT_WINDOW_MS,
  },
  instagram: {
    standardMs: META_RESPONSE_WINDOW_MS,
    humanAgentMs: META_HUMAN_AGENT_WINDOW_MS,
  },
  whatsapp: { standardMs: META_RESPONSE_WINDOW_MS },
  tiktok: { standardMs: TIKTOK_REPLY_WINDOW_MS },
  api: null,
  omnichannel: null,
  webchat: null,
  zalo: null,
  smtp: null,
  telegram: null,
  threads: null,
  line: null,
}

/** `directConversation()`: a chat thread, not a comment thread (email counts as chat). */
export const isDirectConversationSource = (
  sourceId: string | null | undefined,
): boolean =>
  sourceId === null || sourceId === undefined || sourceId.startsWith("email:")

const NO_CHANGE = { changesAt: null, closesAt: null } as const

export function resolveMessagingWindow(input: {
  channel: ChannelType
  /** `sourceId IS NULL` or an `email:` source — see `directConversation()`. */
  isDirect: boolean
  lastIncomingMessageAt: Date | string | null | undefined
  now?: Date | number
}): MessagingWindow {
  if (!input.isDirect) {
    return { state: "notApplicable", ...NO_CHANGE }
  }
  const policy = MESSAGING_WINDOW_POLICY[input.channel]
  if (!policy) {
    return { state: "unlimited", ...NO_CHANGE }
  }
  const last = normalizeLastIncomingMessageAt(input.lastIncomingMessageAt)
  if (!last) {
    return { state: "unknown", ...NO_CHANGE }
  }

  let nowMs = Date.now()
  if (input.now instanceof Date) {
    nowMs = input.now.getTime()
  } else if (typeof input.now === "number") {
    nowMs = input.now
  }

  const elapsedMs = nowMs - last.getTime()
  const standardEnd = new Date(last.getTime() + policy.standardMs)
  const closeEnd = new Date(
    last.getTime() + (policy.humanAgentMs ?? policy.standardMs),
  )

  if (elapsedMs <= policy.standardMs) {
    return { state: "open", changesAt: standardEnd, closesAt: closeEnd }
  }
  if (policy.humanAgentMs !== undefined && elapsedMs <= policy.humanAgentMs) {
    return { state: "humanAgent", changesAt: closeEnd, closesAt: closeEnd }
  }
  return { state: "closed", ...NO_CHANGE }
}

/**
 * `resolveMessagingWindow` for a channel that arrives as a plain string (a DB
 * column, a route param). An unknown channel has no window: `unlimited`.
 */
export function resolveConversationMessagingWindow(input: {
  channel: string
  sourceId: string | null | undefined
  lastIncomingMessageAt: Date | string | null | undefined
  now?: Date | number
}): MessagingWindow {
  const channel = channelTypes.safeParse(input.channel)
  if (!channel.success) {
    return { state: "unlimited", ...NO_CHANGE }
  }
  return resolveMessagingWindow({
    channel: channel.data,
    isDirect: isDirectConversationSource(input.sourceId),
    lastIncomingMessageAt: input.lastIncomingMessageAt,
    now: input.now,
  })
}

/**
 * Worker-side last-line gate for a manual (inbox / API) send: refuses when the
 * window is `closed`. Automation is left to each channel's own rules.
 */
export function assertManualSendWindowOpen(props: {
  channel: ChannelType
  sendFrom: SendFrom | undefined
  lastIncomingMessageAt: Date | string | null | undefined
  now?: Date | number
  code: string
  message: string
}): void {
  if (!isManualSend(props.sendFrom)) {
    return
  }
  const { state } = resolveMessagingWindow({
    channel: props.channel,
    isDirect: true,
    lastIncomingMessageAt: props.lastIncomingMessageAt,
    now: props.now,
  })
  if (state === "closed") {
    throw new ChannelError(
      props.message,
      ChannelErrorCategory.PAYLOAD_INVALID,
      {
        code: props.code,
      },
    )
  }
}
