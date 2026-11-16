import type {
  SendCardStepSchema,
  SendCarouselStepSchema,
} from "@chatbotx.io/flow-config"
import { flowButtons } from "./actions"
import type { LineMessage } from "./dispatch"
import {
  type BubbleContent,
  buttonLabels,
  flexBubbles,
  flexMessages,
} from "./flex"
import { LINE_LIMITS } from "./limits"

/** One card's bubble content; card buttons take the card limit. */
const cardContent = (
  card: SendCardStepSchema,
  flowId: string,
): BubbleContent => ({
  imageUrl: card.image?.url || undefined,
  title: card.title,
  subtitle: card.subtitle,
  buttons: flowButtons(flowId, card.buttons),
  maxButtons: LINE_LIMITS.cardButtons,
})

/**
 * A card as one flex bubble: hero image (if any), full title and subtitle,
 * then its buttons. A card without buttons stays a bubble with no footer.
 */
export const convertFlowStepCard = (
  step: SendCardStepSchema,
  flowId: string,
): LineMessage[] => {
  const content = cardContent(step, flowId)
  return flexMessages(
    flexBubbles(content),
    step.title ||
      step.subtitle ||
      buttonLabels(content.buttons, content.maxButtons),
  )
}

/**
 * A carousel as flex carousel(s): one bubble per card, each with exactly its
 * own image, title, subtitle and buttons (no padding, nothing kept uniform).
 * More than 12 bubbles, or more than the carousel size budget, continue in a
 * further carousel message, in order.
 */
export const convertFlowStepCarousel = (
  step: SendCarouselStepSchema,
  flowId: string,
): LineMessage[] =>
  flexMessages(
    step.cards.flatMap((card) => flexBubbles(cardContent(card, flowId))),
    step.cards
      .map((card) => card.title)
      .filter(Boolean)
      .join(", "),
  )
