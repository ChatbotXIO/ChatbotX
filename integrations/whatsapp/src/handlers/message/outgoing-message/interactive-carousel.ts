import {
  type ButtonStepProps,
  buttonTypes,
  type MetadataPayload,
  whatsappCarouselCardLimits,
} from "@chatbotx.io/flow-config"
import { chunk } from "remeda"
import type {
  CarouselCard,
  CarouselCardAction,
  InteractiveCarouselMessage,
} from "../../../schema"
import { clampText, messageLimits } from "../message-limits"
import { readCardContent, type SendCardPayload } from "./send-card"
import { normalizeRawButton } from "./shared"

/**
 * Meta's URL-button and quick-reply examples both currently use this card type.
 * Keep it centralized because Meta does not document the field independently.
 */
const CAROUSEL_CARD_TYPE = "cta_url"

/**
 * Meta requires a main body, while ChatbotX's carousel step has no equivalent
 * field. Whitespace is rejected after trimming, so use a neutral non-empty body.
 */
const CAROUSEL_MAIN_BODY = "."

const carouselCardActionKinds = {
  ctaUrl: "ctaUrl",
  invalid: "invalid",
  none: "none",
  quickReply: "quickReply",
} as const

type CarouselCardActionKind =
  (typeof carouselCardActionKinds)[keyof typeof carouselCardActionKinds]

type CarouselCardActionProps = {
  buttons: ButtonStepProps[]
  flowId: string
  flowVersionId?: string
  metadata?: MetadataPayload
}

const resolveCarouselCardActionKind = (
  buttons: ButtonStepProps[],
): CarouselCardActionKind => {
  if (buttons.length === 0) {
    return carouselCardActionKinds.none
  }

  if (
    buttons.length === 1 &&
    buttons[0]?.buttonType === buttonTypes.enum.openWebsite
  ) {
    return carouselCardActionKinds.ctaUrl
  }

  if (
    buttons.every(
      (button) => button.buttonType !== buttonTypes.enum.openWebsite,
    )
  ) {
    return carouselCardActionKinds.quickReply
  }

  // A mixed action or multiple URL buttons cannot be represented by Meta's
  // either-one-URL-or-quick-replies contract. Omitting the action deliberately
  // lets Meta reject the invalid card instead of silently changing a URL button
  // into a reply or dropping configured buttons.
  return carouselCardActionKinds.invalid
}

const carouselCardActionBuilders: Record<
  CarouselCardActionKind,
  (props: CarouselCardActionProps) => CarouselCardAction | undefined
> = {
  [carouselCardActionKinds.ctaUrl]: ({ buttons }) => {
    const [button] = buttons

    return button?.buttonType === buttonTypes.enum.openWebsite
      ? {
          name: "cta_url",
          parameters: {
            display_text: clampText(button.label, messageLimits.buttonTitle),
            url: button.beforeStep.url,
          },
        }
      : undefined
  },
  [carouselCardActionKinds.invalid]: () => undefined,
  [carouselCardActionKinds.none]: () => undefined,
  [carouselCardActionKinds.quickReply]: (props) => ({
    // Do not use selectReplyButtons/dedupeReplyButtons here. Dropping a
    // duplicate on only one card violates Meta's equal-button-count rule.
    buttons: props.buttons.map((button) => {
      const normalizedButton = normalizeRawButton({
        flowId: props.flowId,
        flowVersionId: props.flowVersionId,
        button,
        metadata: props.metadata,
      })

      return {
        type: "quick_reply",
        quick_reply: {
          id: clampText(normalizedButton.id, messageLimits.buttonId),
          title: clampText(normalizedButton.label, messageLimits.buttonTitle),
        },
      }
    }),
  }),
}

/**
 * Splits imported legacy carousels while preserving Meta's 2..10-card
 * invariant. For example, 11 cards become 9 + 2 instead of 10 + 1.
 */
export function chunkCarouselCards(
  cards: SendCardPayload[],
): SendCardPayload[][] {
  if (cards.length < whatsappCarouselCardLimits.min) {
    return []
  }

  const cardChunks = chunk(cards, whatsappCarouselCardLimits.max)
  const trailingChunk = cardChunks.at(-1)
  const precedingChunk = cardChunks.at(-2)

  if (trailingChunk?.length === 1 && precedingChunk) {
    const movedCard = precedingChunk.pop()
    if (movedCard) {
      trailingChunk.unshift(movedCard)
    }
  }

  return cardChunks
}

function buildCarouselCard(
  payload: SendCardPayload,
  cardIndex: number,
  props: Omit<CarouselCardActionProps, "buttons">,
): CarouselCard {
  const content = readCardContent(payload)
  const bodyText = clampText(content.caption, messageLimits.carouselCardBody)
  const action = carouselCardActionBuilders[
    resolveCarouselCardActionKind(payload.buttons ?? [])
  ]({
    ...props,
    buttons: payload.buttons ?? [],
  })

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

export function* buildInteractiveCarouselMessages(props: {
  cards: SendCardPayload[]
  flowId: string
  flowVersionId?: string
  metadata?: MetadataPayload
}): Generator<InteractiveCarouselMessage> {
  for (const cards of chunkCarouselCards(props.cards)) {
    yield {
      _type: "interactive_carousel",
      type: "interactive",
      interactive: {
        type: "carousel",
        body: {
          text: clampText(CAROUSEL_MAIN_BODY, messageLimits.carouselMainBody),
        },
        action: {
          cards: cards.map((card, cardIndex) =>
            buildCarouselCard(card, cardIndex, props),
          ),
        },
      },
    }
  }
}
