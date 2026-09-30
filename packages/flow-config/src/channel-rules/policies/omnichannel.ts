import { defineChannelFlowPolicy } from "./define"

export const omnichannelFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 1000,
  },
})
