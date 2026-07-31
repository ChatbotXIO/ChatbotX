import type { z } from "zod"
import { flowValidationCodes } from "../validation-codes"
import { type ButtonStepProps, buttonTypes } from "./button"

/** Meta: "Messages must include between 2 and 10 cards." */
export const whatsappCarouselCardLimits = {
  max: 10,
  min: 2,
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
 * The `openWebsite` button on this card that is about to lose its URL, if any.
 *
 * A card that mixes an `openWebsite` button with any other button has no valid
 * WhatsApp form — `readCarouselCardUrlButton` deliberately declines it, and the
 * send path then falls back to emitting every button as a quick reply, which
 * silently drops the URL. Meta accepts that payload, so nothing downstream ever
 * reports it: the button just quietly stops opening its link.
 *
 * Publish rejects it for a WhatsApp node, so the loss is visible while it is
 * still fixable. An `omnichannel` node carries no WhatsApp rule and can still
 * reach a WhatsApp contact, which is why the send path reports it too — both read
 * this one helper so they cannot disagree about which button is stranded.
 */
export const readStrandedCarouselLinkButton = (
  buttons: ButtonStepProps[],
): ButtonStepProps | undefined =>
  buttons.length > 1
    ? buttons.find(
        (button) => button.buttonType === buttonTypes.enum.openWebsite,
      )
    : undefined

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
 * Every WhatsApp-only rule for one carousel step, as a step-level refinement so
 * a channel validator can attach it to `sendCarouselStepSchema` directly.
 *
 * Kept in this package rather than in the builder because the send path
 * (`integrations/whatsapp`) classifies cards with the same helpers — a rule that
 * lived only next to the UI could start accepting what the sender silently drops.
 */
export const refineWhatsappCarouselStep = (
  step: { cards: Array<{ buttons: ButtonStepProps[] }> },
  ctx: z.RefinementCtx,
): void => {
  const strandedIndex = step.cards.findIndex(
    (card) => readStrandedCarouselLinkButton(card.buttons) !== undefined,
  )
  if (strandedIndex !== -1) {
    ctx.addIssue({
      code: "custom",
      message: flowValidationCodes.whatsappCarouselLinkButtonNotAlone,
      path: ["cards", strandedIndex, "buttons"],
    })
  }

  // Meta only enforces a matching signature once the carousel is sendable.
  if (
    step.cards.length >= whatsappCarouselCardLimits.min &&
    !hasMatchingButtons(step.cards)
  ) {
    ctx.addIssue({
      code: "custom",
      message: flowValidationCodes.whatsappCarouselButtonsMismatch,
      path: ["cards"],
    })
  }
}
