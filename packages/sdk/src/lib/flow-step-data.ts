import type {
  SendAudioStepSchema,
  SendCardStepSchema,
  SendCarouselStepSchema,
  SendChannelPostStepSchema,
  SendCollectionResolvedStep,
  SendCollectionStepSchema,
  SendFileStepSchema,
  SendGifStepSchema,
  SendImageStepSchema,
  SendMessengerTemplateMessageStepSchema,
  SendMultipleImagesStepSchema,
  SendProductsStepSchema,
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

/**
 * A `sendChannelPost` step on a channel that delivers posts natively, after the
 * post was resolved for this send: the platform's own id of the post. A channel
 * that delivers posts as text never sees this step: the worker rewrites it to a
 * `sendText` first.
 */
export type SendChannelPostResolvedStep = SendChannelPostStepSchema & {
  externalPostId: string
}

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
  | SendProductsStepSchema
  // Authored with the post id, then handed to a channel with the post resolved.
  | SendChannelPostStepSchema
  | SendChannelPostResolvedStep
  // Authored, then resolved to its product cards when sent.
  | SendCollectionStepSchema
  | SendCollectionResolvedStep
  | WhatsappLocationStepSchema
  | SendMessengerTemplateMessageStepSchema
  | SendViewCatalogStepSchema
