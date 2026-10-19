import type {
  ButtonStepProps,
  SendCardStepSchema,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepData } from "@chatbotx.io/sdk"

/**
 * Every button a step sends: its own buttons, then each card's buttons. The
 * one place that knows where buttons live on a step, so the send-time rewrites
 * (Mini App links, booking signing, the `/go` wrap) cannot drift apart.
 */
export const readStepButtons = (step: SendFlowStepData): ButtonStepProps[] => [
  ...("buttons" in step ? step.buttons : []),
  ...("cards" in step
    ? step.cards.flatMap((card) => ("buttons" in card ? card.buttons : []))
    : []),
]

/**
 * Rewrites a step's own buttons and each card's buttons with `mapButtons`,
 * leaving everything else on the step untouched.
 */
export const mapStepButtons = async (
  step: SendFlowStepData,
  mapButtons: (
    buttons: ButtonStepProps[],
  ) => ButtonStepProps[] | Promise<ButtonStepProps[]>,
): Promise<SendFlowStepData> => {
  let mapped = step
  if ("buttons" in mapped && mapped.buttons.length > 0) {
    mapped = {
      ...mapped,
      buttons: await mapButtons(mapped.buttons),
    } as SendFlowStepData
  }
  if (!("cards" in mapped) || mapped.cards.length === 0) {
    return mapped
  }
  const cards = await Promise.all(
    mapped.cards.map(async (card) => {
      if (!("buttons" in card) || card.buttons.length === 0) {
        return card
      }
      return {
        ...card,
        buttons: await mapButtons(card.buttons),
      } as SendCardStepSchema
    }),
  )
  return { ...mapped, cards } as SendFlowStepData
}
