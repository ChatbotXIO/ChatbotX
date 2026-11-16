import { CHANNEL_FLOW_POLICIES } from "@chatbotx.io/flow-config"

const lineFlowLimits = CHANNEL_FLOW_POLICIES.line.limits

/**
 * Every numeric limit the LINE integration applies, in one place. LINE's own
 * limits come from the Messaging API reference; the button count and label
 * length are the product's LINE flow policy (enforced at publish), read from
 * it so raising the policy raises what is sent.
 */
export const LINE_LIMITS = {
  /** Message objects per reply or push request. */
  messagesPerRequest: 5,
  /** Characters (UTF-16 units) in a text message. */
  textMessage: 5000,
  /** Items in a message's quick reply. */
  quickReplyItems: 13,
  /** Characters in a flex message's `altText` (required). */
  altText: 1500,
  /** Postback `displayText` characters. */
  displayText: 300,
  /**
   * Action label characters. Flex allows 40 and quick replies 20; the product
   * caps every LINE button label at its policy value.
   */
  actionLabel: lineFlowLimits.buttonLabel,
  /** Buttons on a text step, or following a media step (policy `buttonCount`). */
  stepButtons: lineFlowLimits.buttonCount,
  /** Buttons on one card or carousel card (policy `cardButtonCount`). */
  cardButtons: lineFlowLimits.cardButtonCount,
  /** Bubbles in one flex carousel. */
  carouselBubbles: 12,
  /** Serialized JSON (UTF-8 bytes) of one bubble: 30 KB, read conservatively. */
  bubbleBytes: 30_000,
  /** Serialized JSON (UTF-8 bytes) of one carousel: 50 KB, read conservatively. */
  carouselBytes: 50_000,
  /** Image message `originalContentUrl`: 10 MB, read as decimal to keep a margin. */
  imageOriginalMaxBytes: 10_000_000,
  /** Image / video message `previewImageUrl`: 1 MB, read as decimal to keep a margin. */
  imagePreviewMaxBytes: 1_000_000,
} as const

const isHighSurrogate = (code: number): boolean =>
  code >= 0xd8_00 && code <= 0xdb_ff

/**
 * Index to cut `value` at so the head is at most `max` UTF-16 units and never
 * ends on the first half of a surrogate pair.
 */
export const safeCutIndex = (value: string, max: number): number =>
  max > 0 && isHighSurrogate(value.charCodeAt(max - 1)) ? max - 1 : max

/**
 * Cuts to `max` UTF-16 units (`String.length`, conservative against LINE's
 * limits), marking the cut with "…". Never splits a surrogate pair.
 */
export const truncate = (value: string, max: number): string =>
  value.length <= max
    ? value
    : `${value.slice(0, safeCutIndex(value, max - 1))}…`
