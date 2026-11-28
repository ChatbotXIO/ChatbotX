import { channelPostContentTypes } from "@chatbotx.io/utils/channel-post"
import { buttonTypes } from "../../steps/button"
import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy } from "./define"
// Messenger's Graph API text payload is capped at 2,000 characters.

export const messengerFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    cardButtonCount: 3,
    buttonLabel: 20,
    text: 2000,
  },
  nativeButtonTypes: [buttonTypes.enum.callPhoneNumber],
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
    stepTypes.enum.sendCollection,
    stepTypes.enum.sendChannelPost,
    stepTypes.enum.sendMessengerTemplateMessage,
  ],
  // Messenger has no documented post share, so a post goes as a text with its
  // name and link. Every kind with a permalink works; stories and lives do not.
  channelPostShare: {
    mode: "textLink",
    contentTypes: [
      channelPostContentTypes.enum.text,
      channelPostContentTypes.enum.photo,
      channelPostContentTypes.enum.video,
      channelPostContentTypes.enum.reel,
      channelPostContentTypes.enum.carousel,
      channelPostContentTypes.enum.link,
    ],
  },
  noButtons: [stepTypes.enum.sendAudio, stepTypes.enum.sendFile],
})
