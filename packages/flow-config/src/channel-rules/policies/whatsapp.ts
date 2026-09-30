import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy } from "./define"

export const whatsappFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 4096,
  },
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
