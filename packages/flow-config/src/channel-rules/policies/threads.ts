import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy, whatsappOnlyStepTypes } from "./define"
// Threads replies are capped at 500 characters and do not support media flow steps.

export const threadsFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 500,
  },
  unsupported: [
    stepTypes.enum.sendImage,
    stepTypes.enum.sendVideo,
    stepTypes.enum.sendAudio,
    stepTypes.enum.sendFile,
    stepTypes.enum.sendGif,
    stepTypes.enum.sendCard,
    stepTypes.enum.sendCarousel,
    stepTypes.enum.sendMessengerTemplateMessage,
    ...whatsappOnlyStepTypes,
  ],
})
