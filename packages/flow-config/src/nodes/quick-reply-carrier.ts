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

const QUICK_REPLY_CARRIER_STEPS_BY_CHANNEL: Record<
  string,
  ReadonlySet<StepType>
> = {
  instagram: MEDIA_QUICK_REPLY_CARRIER_STEPS,
  messenger: MEDIA_QUICK_REPLY_CARRIER_STEPS,
  telegram: MEDIA_QUICK_REPLY_CARRIER_STEPS,
  whatsapp: new Set<StepType>([
    stepTypes.enum.sendText,
    stepTypes.enum.sendImage,
    stepTypes.enum.sendCarousel,
  ]),
  zalo: new Set<StepType>([stepTypes.enum.sendText, stepTypes.enum.sendImage]),
}

export function isQuickReplyCarrierStep(
  channel: string | null | undefined,
  step: BaseStepSchema,
) {
  const carrierSteps =
    QUICK_REPLY_CARRIER_STEPS_BY_CHANNEL[channel ?? ""] ??
    DEFAULT_QUICK_REPLY_CARRIER_STEPS

  return carrierSteps.has(step.stepType)
}
