import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy, whatsappOnlyStepTypes } from "./define"
// Webchat retains the 6,000-character platform message limit.

export const webchatFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 6000,
  },
  unsupported: [
    stepTypes.enum.sendMessengerTemplateMessage,
    ...whatsappOnlyStepTypes,
  ],
})
