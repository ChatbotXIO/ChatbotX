import {
  type ButtonStepProps,
  type MetadataPayload,
  whatsappCarouselCardLimits,
} from "@chatbotx.io/flow-config"
import { chunk } from "remeda"
import type { CarouselCard, InteractiveCarouselMessage } from "../../../schema"
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
}

type CardProps = Omit<CarouselProps, "cards">

/**
 * Every button becomes a quick reply, the same as the single-card path: a
 * WhatsApp reply routes back into the flow, and this integration has never
 * mapped `openWebsite` to a link.
 *
 * Replies are not deduplicated here. Dropping a repeated label on one card only
 * would break Meta's rule that button counts match across all cards.
 */
function buildCardButtons(buttons: ButtonStepProps[], props: CardProps) {
  return buttons.map((button) => {
    const reply = normalizeRawButton({ ...props, button })

    return {
      type: "quick_reply" as const,
      quick_reply: {
        id: clampText(reply.id, messageLimits.buttonId),
        title: clampText(reply.label, messageLimits.buttonTitle),
      },
    }
  })
}

function buildCarouselCard(
  payload: SendCardPayload,
  cardIndex: number,
  props: CardProps,
): CarouselCard {
  const content = readCardContent(payload)
  const bodyText = clampText(content.caption, messageLimits.carouselCardBody)
  const buttons = buildCardButtons(payload.buttons ?? [], props)

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
    ...(buttons.length > 0 ? { action: { buttons } } : {}),
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
