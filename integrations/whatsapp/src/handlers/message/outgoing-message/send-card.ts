import type { ButtonStepProps, MetadataPayload } from "@chatbotx.io/flow-config"
import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { Image, Text } from "whatsapp-api-js/messages"
import type { ClientMessage } from "whatsapp-api-js/types"
import { generateFooter } from "../interactive"
import { messageLimits, splitText } from "../message-limits"
import { buildWhatsappButtonMessages } from "./shared"

export type SendCardPayload = {
  title: string
  subtitle?: string
  image?: { url: string }
  buttons?: ButtonStepProps[]
}

export type SendCardProps = {
  flowId: string
  flowVersionId?: string
  metadata?: MetadataPayload
  quickReplies?: MessageButtonTemplate[]
  /** Only a carousel card's link button carries this — see `normalizeRawButton`. */
  contactInboxId?: string
  payload: SendCardPayload
}

/**
 * WhatsApp has no free-form card message, so a card is rendered as whichever
 * native message type carries the most of it.
 */
const cardLayouts = {
  /** Replies as buttons, the image as a header, the title as the body. */
  interactive: "interactive",
  /** A single media message carrying the card text as its caption. */
  captionedImage: "captionedImage",
  /** A single plain text message. */
  text: "text",
  /** Nothing worth sending. */
  empty: "empty",
} as const

type CardLayout = (typeof cardLayouts)[keyof typeof cardLayouts]

type CardContent = {
  /** Interactive body — the title, or the subtitle when no title is set. */
  body: string
  /** Interactive footer — only set when the body came from the title. */
  footer?: string
  /** Absent when the card has no usable image. */
  imageUrl?: string
  /** The whole card as one blob, for the non-interactive layouts. */
  caption: string
}

export function readCardContent(payload: SendCardPayload): CardContent {
  const title = payload.title.trim()
  const subtitle = payload.subtitle?.trim() ?? ""

  // `sendCardStepDefaultFn` always stores an `image` object, so a card without
  // an upload arrives as `{ url: "" }`. Meta rejects a media header whose link
  // is empty and drops the entire message, so an empty url means "no image".
  const imageUrl = payload.image?.url.trim()

  return {
    body: title || subtitle,
    footer: title ? subtitle || undefined : undefined,
    imageUrl: imageUrl || undefined,
    caption: [title, subtitle].filter(Boolean).join("\n"),
  }
}

function resolveCardLayout(
  content: CardContent,
  hasReplies: boolean,
): CardLayout {
  // Meta requires a body on every interactive message, so a card with no text
  // degrades to a media or text message instead of being rejected outright.
  if (hasReplies && content.body) {
    return cardLayouts.interactive
  }
  if (content.imageUrl) {
    return cardLayouts.captionedImage
  }
  if (content.caption) {
    return cardLayouts.text
  }
  return cardLayouts.empty
}

const cardRenderers: Record<
  CardLayout,
  (props: SendCardProps, content: CardContent) => ClientMessage[]
> = {
  [cardLayouts.interactive]: (props, content) =>
    buildWhatsappButtonMessages({
      flowId: props.flowId,
      flowVersionId: props.flowVersionId,
      metadata: props.metadata,
      buttons: props.payload.buttons ?? [],
      quickReplies: props.quickReplies,
      bodyText: content.body,
      media: content.imageUrl ? new Image(content.imageUrl) : undefined,
      footer: content.footer ? generateFooter(content.footer) : undefined,
    }),

  [cardLayouts.captionedImage]: (_props, content) => {
    if (!content.imageUrl) {
      return []
    }

    // Text past the caption limit trails the image as its own message rather
    // than being cut off.
    const [caption, ...overflow] = splitText(
      content.caption,
      messageLimits.caption,
    )

    return [
      new Image(content.imageUrl, false, caption),
      ...overflow.map((chunk) => new Text(chunk)),
    ]
  },

  [cardLayouts.text]: (_props, content) =>
    splitText(content.caption, messageLimits.text).map(
      (chunk) => new Text(chunk),
    ),

  [cardLayouts.empty]: () => [],
}

export function* generateOutgoingMessages(
  props: SendCardProps,
): Generator<ClientMessage> {
  const content = readCardContent(props.payload)
  const hasReplies = Boolean(
    props.payload.buttons?.length || props.quickReplies?.length,
  )

  const layout = resolveCardLayout(content, hasReplies)
  const messages = cardRenderers[layout](props, content)

  // Every reply can still be dropped as blank or duplicated, which would leave
  // the interactive layout with nothing to send. Fall back to the plain layouts
  // so the card's own content reaches the contact instead of vanishing.
  if (messages.length === 0 && layout === cardLayouts.interactive) {
    yield* cardRenderers[resolveCardLayout(content, false)](props, content)
    return
  }

  yield* messages
}
