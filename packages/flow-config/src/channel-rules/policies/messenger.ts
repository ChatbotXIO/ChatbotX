import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy, whatsappOnlyStepTypes } from "./define"

export const messengerFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 2000,
  },
  noButtons: [stepTypes.enum.sendAudio, stepTypes.enum.sendFile],
  unsupported: whatsappOnlyStepTypes,
})
