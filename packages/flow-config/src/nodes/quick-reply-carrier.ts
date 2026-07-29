import type { BaseStepSchema } from "../steps/base"
import { type StepType, stepTypes } from "../steps/step-action"

const DEFAULT_QUICK_REPLY_CARRIER_STEPS = new Set<StepType>([
  stepTypes.enum.sendText,
])

const MEDIA_QUICK_REPLY_CARRIER_STEPS = new Set<StepType>([
  stepTypes.enum.sendText,
  stepTypes.enum.sendImage,
  stepTypes.enum.sendVideo,
  stepTypes.enum.sendAudio,
  stepTypes.enum.sendFile,
  stepTypes.enum.sendGif,
])

const WHATSAPP_QUICK_REPLY_CARRIER_STEPS = new Set<StepType>([
  stepTypes.enum.sendText,
  stepTypes.enum.sendImage,
])

type QuickReplyCarrierRule = (step: BaseStepSchema) => boolean

const usesCarrierStepSet =
  (carrierSteps: ReadonlySet<StepType>): QuickReplyCarrierRule =>
  (step) =>
    carrierSteps.has(step.stepType)

const hasCardCount = (step: BaseStepSchema, expectedCount: number): boolean =>
  "cards" in step &&
  Array.isArray(step.cards) &&
  step.cards.length === expectedCount

const whatsappQuickReplyCarrierRule: QuickReplyCarrierRule = (step) =>
  WHATSAPP_QUICK_REPLY_CARRIER_STEPS.has(step.stepType) ||
  (step.stepType === stepTypes.enum.sendCarousel && hasCardCount(step, 1))

const defaultQuickReplyCarrierRule = usesCarrierStepSet(
  DEFAULT_QUICK_REPLY_CARRIER_STEPS,
)

const QUICK_REPLY_CARRIER_RULES_BY_CHANNEL: Record<
  string,
  QuickReplyCarrierRule
> = {
  instagram: usesCarrierStepSet(MEDIA_QUICK_REPLY_CARRIER_STEPS),
  messenger: usesCarrierStepSet(MEDIA_QUICK_REPLY_CARRIER_STEPS),
  telegram: usesCarrierStepSet(MEDIA_QUICK_REPLY_CARRIER_STEPS),
  whatsapp: whatsappQuickReplyCarrierRule,
  zalo: usesCarrierStepSet(
    new Set<StepType>([stepTypes.enum.sendText, stepTypes.enum.sendImage]),
  ),
}

export function isQuickReplyCarrierStep(
  channel: string | null | undefined,
  step: BaseStepSchema,
) {
  const carrierRule =
    QUICK_REPLY_CARRIER_RULES_BY_CHANNEL[channel ?? ""] ??
    defaultQuickReplyCarrierRule

  return carrierRule(step)
}
