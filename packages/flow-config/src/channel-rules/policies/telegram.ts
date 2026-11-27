import { buttonTypes } from "../../steps/button"
import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy } from "./define"
// Telegram Bot API messages are capped at 4,096 characters. An inline keyboard
// takes up to 100 buttons; 10 keeps a message usable on a phone. A photo or
// video caption is capped at 1,024 characters. Audio and video go out as a
// voice message (`sendVoice`) and a round video (`sendVideoNote`) as notes.

export const telegramFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 10,
    cardButtonCount: 3,
    buttonLabel: 20,
    text: 4096,
    mediaCaption: 1024,
  },
  nativeButtonTypes: [buttonTypes.enum.copyText],
  mediaNotes: [stepTypes.enum.sendAudio, stepTypes.enum.sendVideo],
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
