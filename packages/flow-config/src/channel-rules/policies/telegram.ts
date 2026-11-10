import { buttonTypes } from "../../steps/button"
import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy } from "./define"
// Telegram Bot API messages are capped at 4,096 characters. An inline keyboard
// takes up to 100 buttons; 10 keeps a message usable on a phone.

export const telegramFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 10,
    buttonLabel: 20,
    text: 4096,
  },
  nativeButtonTypes: [buttonTypes.enum.copyText],
  supported: [
    stepTypes.enum.sendText,
    stepTypes.enum.sendImage,
    stepTypes.enum.sendVideo,
    stepTypes.enum.sendMultipleImages,
    stepTypes.enum.sendAudio,
    stepTypes.enum.sendFile,
    stepTypes.enum.sendGif,
    stepTypes.enum.sendQuickReply,
    stepTypes.enum.sendCarousel,
  ],
})
