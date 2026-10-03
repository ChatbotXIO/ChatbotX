import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy } from "./define"
// Zalo OA text payloads are capped at 2,000 characters.

export const zaloFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 2000,
  },
  supported: [
    stepTypes.enum.sendText,
    stepTypes.enum.sendImage,
    stepTypes.enum.sendMultipleImages,
    stepTypes.enum.sendGif,
    stepTypes.enum.sendFile,
  ],
  noButtons: [stepTypes.enum.sendFile],
})
