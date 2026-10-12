import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy } from "./define"
// WhatsApp Cloud API text messages allow 4,096 characters, not the 1,024-character
// limit used by some template components.

export const whatsappFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 4096,
    // `catalog_message` is an interactive message: its body is capped at 1,024
    // characters and its optional footer at 60, unlike the 4,096 of plain text.
    viewCatalog: { footer: 60, text: 1024 },
  },
  quickRepliesShareButtonSlots: true,
  supported: [
    stepTypes.enum.sendText,
    stepTypes.enum.sendImage,
    stepTypes.enum.sendMultipleImages,
    stepTypes.enum.sendCarousel,
    stepTypes.enum.sendViewCatalog,
    stepTypes.enum.sendWaTemplateMessage,
    stepTypes.enum.whatsappOptionList,
    stepTypes.enum.whatsappCallButton,
    stepTypes.enum.whatsappFlow,
    stepTypes.enum.whatsappLocation,
  ],
})
