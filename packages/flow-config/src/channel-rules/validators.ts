import { type StepType, stepTypes } from "../steps/step-action"
import type { StepValidator } from "./channel-validator"
import { sendCarouselValidator } from "./send-carousel-validator"

/**
 * Steps whose rules depend on the channel they are sent through.
 *
 * Deliberately partial: a step listed here is additionally validated against
 * its channel at publish, and a step left out is still covered by
 * `flowVersionSchema` exactly as before. Adding a channel rule therefore means
 * adding one validator module and one line here — `publishFlowSchema` never
 * changes again.
 *
 * Only React-free modules may be imported here: this map is reached from both
 * the builder's `"use server"` publish action and the worker's import
 * validation.
 */
export const channelAwareStepValidators: Partial<
  Record<StepType, StepValidator>
> = {
  [stepTypes.enum.sendCarousel]: sendCarouselValidator,
}
