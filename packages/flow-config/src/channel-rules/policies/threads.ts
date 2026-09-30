import { channelDeliverableStepTypes, defineChannelFlowPolicy } from "./define"
// Threads replies are capped at 500 characters and do not support media flow steps.

export const threadsFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 500,
  },
  unsupported: channelDeliverableStepTypes,
})
