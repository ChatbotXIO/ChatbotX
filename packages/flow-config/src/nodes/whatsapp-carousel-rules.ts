import type { z } from "zod"
import { buttonTypes } from "../steps/button"
import { stepTypes } from "../steps/step-action"
import { nodeTypeSchema } from "./base"
import type { FlowVersionSchema } from "./index"

const WHATSAPP_CHANNEL = "whatsapp"

export const whatsappCarouselCardLimits = {
  max: 10,
  min: 2,
} as const

export const flowValidationCodes = {
  whatsappCarouselButtonsMismatch: "whatsappCarouselButtonsMismatch",
} as const

const carouselButtonKinds = {
  ctaUrl: "ctaUrl",
  quickReply: "quickReply",
} as const

const readButtonSignature = (
  buttons: Array<{ buttonType: string | null }>,
): string =>
  buttons
    .map((button) =>
      button.buttonType === buttonTypes.enum.openWebsite
        ? carouselButtonKinds.ctaUrl
        : carouselButtonKinds.quickReply,
    )
    .join(",")

const hasMatchingButtonSignatures = (
  cards: Array<{ buttons: Array<{ buttonType: string | null }> }>,
): boolean => {
  const expectedSignature = readButtonSignature(cards[0]?.buttons ?? [])
  return cards.every(
    (card) => readButtonSignature(card.buttons) === expectedSignature,
  )
}

/** Applies WhatsApp-only carousel rules at publish time, not draft autosave. */
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
        !hasMatchingButtonSignatures(step.cards),
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
