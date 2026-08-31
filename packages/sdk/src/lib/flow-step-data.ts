import type {
  SendAudioStepSchema,
  SendCarouselStepSchema,
  SendFileStepSchema,
  SendGifStepSchema,
  SendImageStepSchema,
  SendMessengerTemplateMessageStepSchema,
  SendMultipleImagesStepSchema,
  SendQuickReplyStepSchema,
  SendTextStepSchema,
  SendVideoStepSchema,
  SendWaTemplateMessageStepSchema,
  WhatsappFlowStepSchema,
  WhatsappOptionListStepSchema,
} from "@chatbotx.io/flow-config"

export type SendFlowStepData =
  | SendTextStepSchema
  | SendImageStepSchema
  | SendMultipleImagesStepSchema
  | SendGifStepSchema
  | SendAudioStepSchema
  | SendVideoStepSchema
  | SendFileStepSchema
  | SendQuickReplyStepSchema
  | SendCarouselStepSchema
  | SendWaTemplateMessageStepSchema
  | WhatsappOptionListStepSchema
  | WhatsappFlowStepSchema
  | SendMessengerTemplateMessageStepSchema
