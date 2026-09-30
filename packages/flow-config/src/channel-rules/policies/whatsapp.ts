import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy } from "./define"
// WhatsApp Cloud API text messages allow 4,096 characters, not the 1,024-character
// limit used by some template components.

export const whatsappFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 4096,
  },
  quickRepliesShareButtonSlots: true,
  supported: [
    stepTypes.enum.sendText,
    stepTypes.enum.sendImage,
    stepTypes.enum.sendMultipleImages,
    stepTypes.enum.sendCarousel,
    stepTypes.enum.sendWaTemplateMessage,
    stepTypes.enum.whatsappOptionList,
    stepTypes.enum.whatsappCallButton,
    stepTypes.enum.whatsappFlow,
  ],
  // WhatsApp's converter implements text, images, carousels, and WhatsApp
  // interactive/template steps; it has no converters for these step types.
  unsupported: [
    stepTypes.enum.sendVideo,
    stepTypes.enum.sendAudio,
    stepTypes.enum.sendFile,
    stepTypes.enum.sendGif,
    stepTypes.enum.sendCard,
    stepTypes.enum.sendQuickReply,
    stepTypes.enum.sendMessengerTemplateMessage,
  ],
})
