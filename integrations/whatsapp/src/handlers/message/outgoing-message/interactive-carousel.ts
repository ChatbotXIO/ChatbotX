import {
  appendCodeToMagicLink,
  type ButtonStepProps,
  type MetadataPayload,
  readCarouselCardUrlButton,
  readStrandedCarouselLinkButton,
  whatsappCarouselCardLimits,
} from "@chatbotx.io/flow-config"
import { chunk } from "remeda"
import { logger } from "../../../lib/logger"
import type {
  CarouselCard,
  CarouselCardAction,
  InteractiveCarouselMessage,
} from "../../../schema"
import { clampText, messageLimits } from "../message-limits"
import { readCardContent, type SendCardPayload } from "./send-card"
import { normalizeRawButton } from "./shared"

/** Both examples in Meta's docs carry this card type, the quick-reply one included. */
const CAROUSEL_CARD_TYPE = "cta_url"

/**
 * Meta requires a main body, while the carousel step has no field for one and
 * the main message accepts no header, footer or buttons to carry anything else.
 */
const CAROUSEL_MAIN_BODY = "."

type CarouselProps = {
  cards: SendCardPayload[]
  flowId: string
  flowVersionId?: string
  metadata?: MetadataPayload
  contactInboxId?: string
}

type CardProps = Omit<CarouselProps, "cards">

/**
 * Replies are not deduplicated here. Dropping a repeated label on one card only
 * would break Meta's rule that button counts match across all cards.
 *
 * `contactInboxId` is left out on purpose — see `normalizeRawButton`.
 */
function buildCardButtons(buttons: ButtonStepProps[], props: CardProps) {
  return buttons.map((button) => {
    const reply = normalizeRawButton({
      flowId: props.flowId,
      flowVersionId: props.flowVersionId,
      metadata: props.metadata,
      button,
    })

    return {
      type: "quick_reply" as const,
      quick_reply: {
        id: clampText(reply.id, messageLimits.buttonId),
        title: clampText(reply.label, messageLimits.buttonTitle),
      },
    }
  })
}

/**
 * A carousel card is the one place WhatsApp accepts a link button, so an
 * `openWebsite` button keeps its URL here while every other path in this
 * integration still sends it as a reply.
 *
 * The code is appended for the same reason as on Messenger: a magic link carries
 * it back to the redirect route, which needs it to tell who clicked. A plain URL
 * is returned untouched by `appendCodeToMagicLink`.
 */
function buildCardAction(
  buttons: ButtonStepProps[],
  props: CardProps & { cardIndex: number },
): CarouselCardAction | undefined {
  const urlButton = readCarouselCardUrlButton(buttons)

  if (urlButton) {
    const { id, label } = normalizeRawButton({
      ...props,
      button: urlButton.button,
    })

    return {
      name: CAROUSEL_CARD_TYPE,
      parameters: {
        display_text: clampText(label, messageLimits.buttonTitle),
        url: appendCodeToMagicLink(urlButton.url, id),
      },
    }
  }

  // Meta accepts the degraded payload, so this is the only signal that the link
  // was lost. Publish already blocks it on a WhatsApp node; an `omnichannel` node
  // carries no WhatsApp rule and still arrives here.
  const strandedLinkButton = readStrandedCarouselLinkButton(buttons)
  if (strandedLinkButton) {
    logger.warn(
      {
        flowId: props.flowId,
        flowVersionId: props.flowVersionId,
        // Indexed the same way the publish error is, so a report and a rejection
        // point at the same card.
        cardIndex: props.cardIndex,
        buttonId: strandedLinkButton.id,
      },
      "Carousel card mixes a link button with other buttons; sending every button as a reply and dropping the link",
    )
  }

  const replies = buildCardButtons(buttons, props)

  return replies.length > 0 ? { buttons: replies } : undefined
}

function buildCarouselCard(
  payload: SendCardPayload,
  cardIndex: number,
  props: CardProps,
): CarouselCard {
  const content = readCardContent(payload)
  const bodyText = clampText(content.caption, messageLimits.carouselCardBody)
  const action = buildCardAction(payload.buttons ?? [], { ...props, cardIndex })

  return {
    card_index: cardIndex,
    type: CAROUSEL_CARD_TYPE,
    ...(content.imageUrl
      ? {
          header: {
            type: "image" as const,
            image: { link: content.imageUrl },
          },
        }
      : {}),
    ...(bodyText ? { body: { text: bodyText } } : {}),
    ...(action ? { action } : {}),
  }
}

/**
 * Keeps every chunk within Meta's 2..10 cards, so 11 cards become 9 + 2 rather
 * than a 10 + 1 whose trailing chunk is too small to send.
 */
export function chunkCarouselCards(
  cards: SendCardPayload[],
): SendCardPayload[][] {
  const chunks = chunk(cards, whatsappCarouselCardLimits.max)
  const lastChunk = chunks.at(-1)
  const previousChunk = chunks.at(-2)

  if (lastChunk?.length === 1 && previousChunk) {
    const movedCard = previousChunk.pop()
    if (movedCard) {
      lastChunk.unshift(movedCard)
    }
  }

  return chunks
}

export function* buildInteractiveCarouselMessages(
  props: CarouselProps,
): Generator<InteractiveCarouselMessage> {
  for (const cards of chunkCarouselCards(props.cards)) {
    yield {
      _type: "interactive_carousel",
      type: "interactive",
      interactive: {
        type: "carousel",
        body: { text: CAROUSEL_MAIN_BODY },
        action: {
          cards: cards.map((card, cardIndex) =>
            buildCarouselCard(card, cardIndex, props),
          ),
        },
      },
    }
  }
}
