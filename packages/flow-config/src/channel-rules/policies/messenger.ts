import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy } from "./define"
// Messenger's Graph API text payload is capped at 2,000 characters.

export const messengerFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 2000,
  },
  supported: [
    stepTypes.enum.sendText,
    stepTypes.enum.sendImage,
    stepTypes.enum.sendVideo,
    stepTypes.enum.sendMultipleImages,
    stepTypes.enum.sendAudio,
    stepTypes.enum.sendFile,
    stepTypes.enum.sendGif,
    stepTypes.enum.sendQuickReply,
    stepTypes.enum.sendCard,
    stepTypes.enum.sendCarousel,
    stepTypes.enum.sendMessengerTemplateMessage,
  ],
  noButtons: [stepTypes.enum.sendAudio, stepTypes.enum.sendFile],
})
