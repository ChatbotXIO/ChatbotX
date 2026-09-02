import type { ChannelType } from "@chatbotx.io/utils/channel"
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

// Meta's Send API accepts `quick_replies` alongside any message shape,
// including the batched `attachments[]` album `sendMultipleImages` uses —
// unlike Telegram's `sendMediaGroup`, which has no `reply_markup` support
// (see integrations/telegram/.../send-attachment.ts). Keep Telegram on the
// plain set above.
const META_QUICK_REPLY_CARRIER_STEPS = new Set<StepType>([
  ...MEDIA_QUICK_REPLY_CARRIER_STEPS,
  stepTypes.enum.sendMultipleImages,
])

/**
 * Partial on purpose: a channel with no entry carries quick replies on text
 * only. Keyed by `ChannelType` rather than `string` so a renamed or misspelt
 * channel fails to compile instead of silently falling back to that default.
 */
const QUICK_REPLY_CARRIER_STEPS_BY_CHANNEL: Partial<
  Record<ChannelType, ReadonlySet<StepType>>
> = {
  instagram: META_QUICK_REPLY_CARRIER_STEPS,
  messenger: META_QUICK_REPLY_CARRIER_STEPS,
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
  // `channel` reaches here as a plain string (the flow's `chooseChannel` step
  // stores it untyped), so the lookup stays loose while the table above does not.
  const carrierSteps =
    (
      QUICK_REPLY_CARRIER_STEPS_BY_CHANNEL as Record<
        string,
        ReadonlySet<StepType> | undefined
      >
    )[channel ?? ""] ?? DEFAULT_QUICK_REPLY_CARRIER_STEPS

  return carrierSteps.has(step.stepType)
}
