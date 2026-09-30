import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy, whatsappOnlyStepTypes } from "./define"
// Messenger's Graph API text payload is capped at 2,000 characters.

export const messengerFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 2000,
  },
  // Messenger has no runtime implementation for WhatsApp-specific step types.
  noButtons: [stepTypes.enum.sendAudio, stepTypes.enum.sendFile],
  unsupported: whatsappOnlyStepTypes,
})
