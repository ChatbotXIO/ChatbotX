import type { ThreadControlEvent } from "@chatbotx.io/database/partials"
import {
  isThreadControlChannel,
  type ThreadControlChannel,
} from "@chatbotx.io/utils/channel"

/**
 * Events that prove another responder shares the number (or that an explicit
 * handover happened). They mark the inbox as multi-responder; `serviceSent` is
 * our own send, and a context-less `inboundReceived` is what a single-partner
 * number produces, so neither does (an inbound WITH context does, see
 * `isRoutingTraffic`).
 */
const ROUTING_TRAFFIC_EVENTS: Record<ThreadControlEvent, boolean> = {
  inboundReceived: false,
  standbyReceived: true,
  controlPassed: true,
  controlTaken: true,
  taken: true,
  released: true,
  passed: true,
  serviceSent: false,
  serviceRejected: true,
}

export const isRoutingTraffic = (
  event: ThreadControlEvent,
  hasContext: boolean,
): boolean => ROUTING_TRAFFIC_EVENTS[event] || hasContext

/**
 * Plain-text fallback of the timeline divider (search, previews, exports); the
 * builder localizes from `contentAttributes`. Brand-neutral on purpose: a
 * white-label tenant must never see the platform's name in stored text.
 */
export const THREAD_CONTROL_ACTIVITY_TEXT: Record<ThreadControlEvent, string> =
  {
    inboundReceived: "This app is now handling this conversation",
    standbyReceived: "Another app is now handling this conversation",
    controlPassed: "Conversation handed to this app",
    controlTaken: "Another app took over this conversation",
    taken: "This app took over this conversation",
    released: "Conversation released",
    passed: "Conversation passed to another app",
    serviceSent: "This app is now handling this conversation",
    serviceRejected:
      "Message not sent: another app is handling this conversation",
  }

/**
 * Per-channel wording where a channel's routing model has its own vocabulary
 * (WhatsApp hands the thread to the "escalation partner"). Only the events a
 * channel words differently are listed; everything else falls back to the
 * neutral text above. Keyed by `ThreadControlChannel`, so shared code never
 * branches on a channel name.
 */
const THREAD_CONTROL_ACTIVITY_TEXT_BY_CHANNEL: Partial<
  Record<ThreadControlChannel, Partial<Record<ThreadControlEvent, string>>>
> = {
  whatsapp: {
    passed: "Conversation passed to the escalation partner",
  },
}

/** The plain-text divider of `event` on `channel` (neutral unless the channel words it itself). */
export const resolveThreadControlActivityText = (
  event: ThreadControlEvent,
  channel: string,
): string =>
  (isThreadControlChannel(channel)
    ? THREAD_CONTROL_ACTIVITY_TEXT_BY_CHANNEL[channel]?.[event]
    : undefined) ?? THREAD_CONTROL_ACTIVITY_TEXT[event]

export const THREAD_CONTROL_ACTIVITY_TYPE = "threadControl"
export const THREAD_CONTROL_CONTEXT_TYPE = "threadControlContext"
export const THREAD_CONTROL_SOURCE_ID_PREFIX = "thread-control"
export const THREAD_CONTROL_CONTEXT_SOURCE_ID_PREFIX = "thread-control-context"

/**
 * `contentAttributes` marker on a message stored from a standby delivery. The
 * owner delivery of the same message promotes it (once, atomically) and runs the
 * owner-side work then.
 */
export const THREAD_CONTROL_DELIVERY_KEY = "threadControlDelivery"
export const THREAD_CONTROL_STANDBY_DELIVERY = "standby"
/**
 * One-shot guard of that promotion. The standby marker stays on the row (it
 * records how the message first arrived); this key, claimed atomically, is
 * what makes a promoted row impossible to promote twice.
 */
export const THREAD_CONTROL_PROMOTED_KEY = "threadControlPromoted"
