import { channelPostContentTypes } from "@chatbotx.io/utils/channel-post"
import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy } from "./define"
// Instagram's Graph API text payload is capped at 1,000 characters.

export const instagramFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    cardButtonCount: 3,
    buttonLabel: 20,
    text: 1000,
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
    stepTypes.enum.sendCarousel,
    stepTypes.enum.sendChannelPost,
  ],
  // The platform's own post share. Stories and lives are ephemeral and text
  // has no media, so none of them can be shared.
  channelPostShare: {
    mode: "nativeMedia",
    contentTypes: [
      channelPostContentTypes.enum.photo,
      channelPostContentTypes.enum.video,
      channelPostContentTypes.enum.reel,
      channelPostContentTypes.enum.carousel,
    ],
  },
  // Instagram's attachment sender accepts media only; quick replies attach to
  // the carrier message rather than the media step itself.
  noButtons: [
    stepTypes.enum.sendImage,
    stepTypes.enum.sendVideo,
    stepTypes.enum.sendAudio,
    stepTypes.enum.sendFile,
  ],
})
