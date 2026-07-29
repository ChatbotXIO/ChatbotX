import type { z } from "zod"
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
 * Meta: "Button types and numbers must match across all cards." Every card
 * button leaves as a quick reply, so the count is the only thing that can
 * differ — and one mismatched card makes Meta reject the whole carousel.
 */
const hasMatchingButtonCounts = (
  cards: Array<{ buttons: unknown[] }>,
): boolean => {
  const expectedCount = cards[0]?.buttons.length

  return cards.every((card) => card.buttons.length === expectedCount)
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
        !hasMatchingButtonCounts(step.cards),
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
