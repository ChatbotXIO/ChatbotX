import type {
  SendAudioStepSchema,
  SendCarouselStepSchema,
  SendFileStepSchema,
  SendGifStepSchema,
  SendImageStepSchema,
  SendMessengerTemplateMessageStepSchema,
  SendQuickReplyStepSchema,
  SendTextStepSchema,
  SendVideoStepSchema,
  SendWaTemplateMessageStepSchema,
  WhatsappCallButtonStepSchema,
  WhatsappFlowStepSchema,
  WhatsappOptionListStepSchema,
} from "@chatbotx.io/flow-config"

export type SendFlowStepData =
  | SendTextStepSchema
  | SendImageStepSchema
  | SendGifStepSchema
  | SendAudioStepSchema
  | SendVideoStepSchema
  | SendFileStepSchema
  | SendQuickReplyStepSchema
  | SendCarouselStepSchema
  | SendWaTemplateMessageStepSchema
  | WhatsappOptionListStepSchema
  | WhatsappCallButtonStepSchema
  | WhatsappFlowStepSchema
  | SendMessengerTemplateMessageStepSchema
