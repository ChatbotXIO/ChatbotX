import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy, whatsappOnlyStepTypes } from "./define"
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
  // Zalo's attachment conversion has no button payload for file steps.
  noButtons: [stepTypes.enum.sendFile],
  // Zalo's runtime switch has no video, audio, card, carousel, quick-reply,
  // Messenger-template, or WhatsApp-specific converter.
  unsupported: [
    stepTypes.enum.sendVideo,
    stepTypes.enum.sendAudio,
    stepTypes.enum.sendCard,
    stepTypes.enum.sendCarousel,
    stepTypes.enum.sendQuickReply,
    stepTypes.enum.sendMessengerTemplateMessage,
    ...whatsappOnlyStepTypes,
  ],
})
