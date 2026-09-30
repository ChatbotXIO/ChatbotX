import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy, whatsappOnlyStepTypes } from "./define"
// Telegram Bot API messages are capped at 4,096 characters.

export const telegramFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 4096,
  },
  // Telegram's runtime switch implements media, quick replies, and carousels,
  // but has no card or Messenger-template converter.
  unsupported: [
    stepTypes.enum.sendCard,
    stepTypes.enum.sendMessengerTemplateMessage,
    ...whatsappOnlyStepTypes,
  ],
})
