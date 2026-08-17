import { channelTypes } from "@chatbotx.io/utils/channel"
import { sendCarouselStepSchema } from "../steps/send-carousel"
import { refineWhatsappCarouselStep } from "../steps/whatsapp-carousel-rules"
import type { ChannelValidatorMap } from "./channel-validator"

/**
 * Kept apart from the step's editor/viewer modules — this is imported directly
 * by `validators.ts`, which is reached from both the builder's publish schema
 * and the worker's import validation, so it must stay React-free.
 */
export const sendCarouselValidator = {
  [channelTypes.enum.omnichannel]: sendCarouselStepSchema,
  [channelTypes.enum.whatsapp]: sendCarouselStepSchema.superRefine(
    refineWhatsappCarouselStep,
  ),
} satisfies ChannelValidatorMap
