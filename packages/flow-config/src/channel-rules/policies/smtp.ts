import { defineChannelFlowPolicy } from "./define"

export const smtpFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 6000,
  },
})
