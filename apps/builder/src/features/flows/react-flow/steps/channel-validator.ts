import { type ChannelType, channelTypes } from "@chatbotx.io/database/partials"
import type { ZodTypeAny } from "zod"

/**
 * A step's validator, per channel.
 *
 * `omnichannel` is required and acts as the base: it is what a step validates
 * against on any channel that declares no rule of its own. Every other channel
 * is optional and overrides that base entirely (it does not compose with it, so
 * an override is normally the base schema plus a `superRefine`).
 *
 * This exists because channel rules are per-step, not per-flow — Meta restricts
 * carousel buttons, Zalo caps button counts, and so on. Declaring them next to
 * the step keeps `publishFlowSchema` from collecting one bespoke refinement per
 * channel/step pair.
 */
type OmnichannelType = typeof channelTypes.enum.omnichannel

export type ChannelValidatorMap = {
  [channelTypes.enum.omnichannel]: ZodTypeAny
} & Partial<Record<Exclude<ChannelType, OmnichannelType>, ZodTypeAny>>

/** A step validates the same way everywhere, or once per channel. */
export type StepValidator = ZodTypeAny | ChannelValidatorMap

/**
 * Zod schemas are objects too, so the map is identified by the absence of the
 * marker every schema carries rather than by shape.
 */
const isChannelValidatorMap = (
  validator: StepValidator,
): validator is ChannelValidatorMap => !("_def" in validator)

/**
 * `chooseChannelStepSchema.channel` is a plain string, so an unknown or empty
 * channel is representable and falls back to the base rather than throwing.
 */
export const resolveStepValidator = (
  validator: StepValidator,
  channel: string,
): ZodTypeAny => {
  if (!isChannelValidatorMap(validator)) {
    return validator
  }

  const override = (validator as Record<string, ZodTypeAny | undefined>)[
    channel
  ]

  return override ?? validator[channelTypes.enum.omnichannel]
}
