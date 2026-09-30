import { defineChannelFlowPolicy } from "./define"
// Keep the established 1,000-character cross-channel authoring limit rather
// than applying Threads' standalone 500-character cap to every destination.

export const omnichannelFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 1000,
  },
})
