import { defineChannelFlowPolicy, whatsappOnlyStepTypes } from "./define"

export const webchatFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 6000,
  },
  unsupported: whatsappOnlyStepTypes,
})
