import type {
  SendAudioStepSchema,
  SendCardStepSchema,
  SendCarouselStepSchema,
  SendFileStepSchema,
  SendGifStepSchema,
  SendImageStepSchema,
  SendMessengerTemplateMessageStepSchema,
  SendMultipleImagesStepSchema,
  SendQuickReplyStepSchema,
  SendTextStepSchema,
  SendVideoStepSchema,
  SendViewCatalogStepSchema,
  SendWaTemplateMessageStepSchema,
  WhatsappCallButtonStepSchema,
  WhatsappFlowStepSchema,
  WhatsappLocationStepSchema,
  WhatsappOptionListStepSchema,
} from "@chatbotx.io/flow-config"

export type SendFlowStepData =
  | SendTextStepSchema
  | SendImageStepSchema
  | SendMultipleImagesStepSchema
  | SendCardStepSchema
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
  | WhatsappLocationStepSchema
  | SendMessengerTemplateMessageStepSchema
  | SendViewCatalogStepSchema
