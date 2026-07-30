import type { z } from "zod"
import { type ButtonStepProps, buttonTypes } from "../steps/button"
import { stepTypes } from "../steps/step-action"
import { nodeTypeSchema } from "./base"
import type { FlowVersionSchema } from "./index"

const WHATSAPP_CHANNEL = "whatsapp"

/** Meta: "Messages must include between 2 and 10 cards." */
export const whatsappCarouselCardLimits = {
  max: 10,
  min: 2,
} as const

export const flowValidationCodes = {
  whatsappCarouselButtonsMismatch: "whatsappCarouselButtonsMismatch",
} as const

/**
 * Meta: "Cards must include either one URL button, or one or more quick-reply
 * buttons." Those are two different payload shapes, so a card carrying both
 * kinds has no valid form at all — it keeps sending every button as a reply
 * instead of dropping the rest, which is why a link card is recognised only when
 * `openWebsite` is the card's sole button.
 *
 * Shared with the WhatsApp integration on purpose: the publish rule below and
 * the sent payload have to classify a card the same way or one would reject what
 * the other happily sends.
 */
export const readCarouselCardUrlButton = (
  buttons: ButtonStepProps[],
): { button: ButtonStepProps; url: string } | undefined => {
  const [button] = buttons

  if (
    buttons.length !== 1 ||
    button?.buttonType !== buttonTypes.enum.openWebsite
  ) {
    return
  }

  return { button, url: button.beforeStep.url }
}

/**
 * Meta: "Button types and numbers must match across all cards (for example, if
 * you define a card with 2 quick-reply buttons, all cards must define exactly 2
 * quick-reply buttons)." A count alone cannot tell a link card from a card with
 * one reply, so the kind is part of the signature.
 */
const readCardButtonSignature = (buttons: ButtonStepProps[]): string =>
  readCarouselCardUrlButton(buttons) ? "link" : `reply:${buttons.length}`

/** One mismatched card makes Meta reject the whole carousel. */
const hasMatchingButtons = (
  cards: Array<{ buttons: ButtonStepProps[] }>,
): boolean => {
  const expected = readCardButtonSignature(cards[0]?.buttons ?? [])

  return cards.every(
    (card) => readCardButtonSignature(card.buttons) === expected,
  )
}

/**
 * Runs on publish only, never on draft autosave, so a half-built carousel is
 * still saved. Other channels send each card as its own message and are left
 * alone.
 */
export const refineWhatsappCarouselButtons = (
  nodes: FlowVersionSchema[],
  ctx: z.RefinementCtx,
): void => {
  nodes.forEach((node, nodeIndex) => {
    if (
      node.type !== nodeTypeSchema.enum.sendMessage ||
      node.data.details.beforeStep.channel !== WHATSAPP_CHANNEL
    ) {
      return
    }

    const hasInvalidCarousel = node.data.details.steps.some(
      (step) =>
        step.stepType === stepTypes.enum.sendCarousel &&
        step.cards.length >= whatsappCarouselCardLimits.min &&
        !hasMatchingButtons(step.cards),
    )

    if (hasInvalidCarousel) {
      ctx.addIssue({
        code: "custom",
        message: flowValidationCodes.whatsappCarouselButtonsMismatch,
        path: [nodeIndex],
      })
    }
  })
}
