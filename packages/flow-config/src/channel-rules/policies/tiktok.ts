import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy, whatsappOnlyStepTypes } from "./define"

export const TIKTOK_CARD_TITLE_MAX = 40

export const tiktokFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    cardTitle: TIKTOK_CARD_TITLE_MAX,
    text: 6000,
  },
  noButtons: [stepTypes.enum.sendImage],
  unsupported: [
    stepTypes.enum.sendCard,
    stepTypes.enum.sendCarousel,
    stepTypes.enum.sendVideo,
    stepTypes.enum.sendGif,
    stepTypes.enum.sendAudio,
    stepTypes.enum.sendFile,
    stepTypes.enum.sendQuickReply,
    stepTypes.enum.sendMessengerTemplateMessage,
    ...whatsappOnlyStepTypes,
  ],
})
