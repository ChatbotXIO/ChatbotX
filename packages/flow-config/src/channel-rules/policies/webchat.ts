import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy } from "./define"
// Webchat retains the 6,000-character platform message limit.

export const webchatFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 6000,
  },
  supported: [
    stepTypes.enum.sendText,
    stepTypes.enum.sendImage,
    stepTypes.enum.sendMultipleImages,
    stepTypes.enum.sendCard,
    stepTypes.enum.sendCarousel,
    stepTypes.enum.sendVideo,
    stepTypes.enum.sendGif,
    stepTypes.enum.sendAudio,
    stepTypes.enum.sendFile,
    stepTypes.enum.sendQuickReply,
  ],
})
