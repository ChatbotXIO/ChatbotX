import { defineChannelFlowPolicy } from "./define"
// Threads has no direct-message delivery runtime.

export const threadsFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 500,
  },
})
