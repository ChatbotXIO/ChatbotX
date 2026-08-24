import { channelTypes } from "@chatbotx.io/utils/channel"
import { sendWaTemplateMessageStepSchema } from "../steps/send-wa-message-template"
import { refineWaTemplateSendStep } from "../steps/wa-template-send-rules"
import type { ChannelValidatorMap } from "./channel-validator"

/**
 * Kept apart from the step's editor/viewer modules — this is imported directly
 * by `validators.ts`, which is reached from both the builder's publish schema
 * and the worker's import validation, so it must stay React-free.
 *
 * The rule applies on every channel (`omnichannel` only): a `sendWaTemplateMessage`
 * step is WhatsApp-only by construction, so there is no separate per-channel
 * override to declare.
 */
export const sendWaTemplateMessageValidator = {
  [channelTypes.enum.omnichannel]: sendWaTemplateMessageStepSchema.superRefine(
    refineWaTemplateSendStep,
  ),
} satisfies ChannelValidatorMap
