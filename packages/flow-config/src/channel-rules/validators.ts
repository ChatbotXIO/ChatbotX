import { type StepType, stepTypes } from "../steps/step-action"
import type { StepValidator } from "./channel-validator"
import {
  sendAudioValidator,
  sendFileValidator,
  sendGifValidator,
  sendImageValidator,
  sendVideoValidator,
} from "./media-step-validators"
import { sendCarouselValidator } from "./send-carousel-validator"
import { sendTextValidator } from "./send-text-validator"
import { sendWaTemplateMessageValidator } from "./send-wa-template-validator"

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
  [stepTypes.enum.sendAudio]: sendAudioValidator,
  [stepTypes.enum.sendCarousel]: sendCarouselValidator,
  [stepTypes.enum.sendFile]: sendFileValidator,
  [stepTypes.enum.sendGif]: sendGifValidator,
  [stepTypes.enum.sendImage]: sendImageValidator,
  [stepTypes.enum.sendText]: sendTextValidator,
  [stepTypes.enum.sendVideo]: sendVideoValidator,
  [stepTypes.enum.sendWaTemplateMessage]: sendWaTemplateMessageValidator,
}
