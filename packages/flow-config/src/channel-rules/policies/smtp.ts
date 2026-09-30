import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy, whatsappOnlyStepTypes } from "./define"
// SMTP delivery retains the 6,000-character platform message limit.

export const smtpFlowPolicy = defineChannelFlowPolicy({
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
