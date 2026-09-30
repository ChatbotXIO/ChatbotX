import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy, whatsappOnlyStepTypes } from "./define"
// API messages use the platform's 6,000-character transport limit.

export const apiFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 6000,
  },
  // The API attachment transport has no button payload; text keeps buttons.
  noButtons: [
    stepTypes.enum.sendImage,
    stepTypes.enum.sendVideo,
    stepTypes.enum.sendAudio,
    stepTypes.enum.sendFile,
  ],
  // No API runtime converter exists for cards or channel-owned templates.
  unsupported: [
    stepTypes.enum.sendCard,
    stepTypes.enum.sendMessengerTemplateMessage,
    ...whatsappOnlyStepTypes,
  ],
})
