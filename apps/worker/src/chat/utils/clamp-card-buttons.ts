import {
  buttonContainers,
  getButtonCountLimit,
  getChannelFlowPolicy,
  type StepType,
  stepTypes,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepData } from "@chatbotx.io/sdk"

/**
 * Steps that are, or hold, cards. Only card buttons are clamped: see
 * `clampCardButtonsToChannel`.
 */
const cardStepTypes: ReadonlySet<StepType> = new Set([
  stepTypes.enum.sendCard,
  stepTypes.enum.sendCarousel,
])

export type ClampedCardButtons = {
  step: SendFlowStepData
  /** Buttons removed, per group: `step` for the step's own, `cards.<i>` per card. */
  dropped: { group: string; kept: number; dropped: number }[]
}

/**
 * Cuts the buttons of a card (a `sendCard` step, each card of a
 * `sendCarousel`) to the RESOLVED channel's card limit
 * (`getButtonCountLimit(policy, "card")`), keeping the leading ones.
 *
 * Publish checks a node against the channel it was authored for, but nothing
 * at runtime stops a node reaching a contact on another channel (a
 * `startAnotherNode` jump, a broadcast), so a LINE card with 5 buttons can
 * reach a Messenger contact. A card with more buttons than the channel's API
 * takes is rejected whole, so the extra are dropped here, once, before the
 * Message row and every channel encoder see the step.
 *
 * Buttons of text and media steps are deliberately NOT clamped here: what a
 * channel can deliver is the integration's knowledge, not the policy's.
 * Several deliver all of them (TikTok and WhatsApp split into further
 * messages, Zalo sends 5), so cutting to the policy number would drop buttons
 * those channels send today. Messenger and Instagram keep only the first 3
 * and log a warning for the rest in their `convertButtons`. A step within the
 * limit, an unknown channel, or any other step type is returned unchanged.
 */
export const clampCardButtonsToChannel = (
  step: SendFlowStepData,
  channel: string,
): ClampedCardButtons => {
  const policy = getChannelFlowPolicy(channel)
  if (!(policy && cardStepTypes.has(step.stepType))) {
    return { step, dropped: [] }
  }

  const limit = getButtonCountLimit(policy, buttonContainers.card)
  const dropped: ClampedCardButtons["dropped"] = []
  let clamped = step

  if ("buttons" in clamped && clamped.buttons.length > limit) {
    dropped.push({
      group: "step",
      kept: limit,
      dropped: clamped.buttons.length - limit,
    })
    clamped = {
      ...clamped,
      buttons: clamped.buttons.slice(0, limit),
    } as SendFlowStepData
  }

  if ("cards" in clamped) {
    let cardsChanged = false
    const cards = clamped.cards.map((card, index) => {
      if (!("buttons" in card) || card.buttons.length <= limit) {
        return card
      }
      cardsChanged = true
      dropped.push({
        group: `cards.${index}`,
        kept: limit,
        dropped: card.buttons.length - limit,
      })
      return { ...card, buttons: card.buttons.slice(0, limit) }
    })
    if (cardsChanged) {
      clamped = { ...clamped, cards } as SendFlowStepData
    }
  }

  return { step: clamped, dropped }
}
