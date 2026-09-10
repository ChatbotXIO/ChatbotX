import {
  ReplyFormat,
  type ReplyFormat as ReplyFormatValue,
} from "@chatbotx.io/flow-config"
import {
  asCoordinatePair,
  asEmail,
  asIs,
  asIsoDate,
  asNumber,
  asPhone,
  asUrl,
  firstAccepted,
  fromAttachment,
  fromLocation,
  fromText,
  fromTextWhenAttachmentAbsent,
} from "./reply-input.combinators"
import type {
  ReplyInputMessage,
  ReplyValidationResult,
  ReplyValidator,
} from "./reply-input.types"

export const replyFormatValidators: Record<ReplyFormatValue, ReplyValidator> = {
  [ReplyFormat.number]: fromTextWhenAttachmentAbsent(asNumber),
  [ReplyFormat.text]: fromTextWhenAttachmentAbsent(asIs),
  [ReplyFormat.email]: fromTextWhenAttachmentAbsent(asEmail),
  [ReplyFormat.phone]: fromTextWhenAttachmentAbsent(asPhone),
  [ReplyFormat.image]: firstAccepted(
    fromAttachment((type) => type === "image"),
    fromTextWhenAttachmentAbsent(asIs),
  ),
  [ReplyFormat.file]: firstAccepted(
    fromAttachment(() => true),
    fromTextWhenAttachmentAbsent(asIs),
  ),
  [ReplyFormat.link]: fromTextWhenAttachmentAbsent(asUrl),
  // Prefer a real location pin (WhatsApp/Messenger/Zalo contentType). Typed
  // "lat,lng" is the omnichannel fallback so webchat/API contacts can still
  // complete RF08 without a native share-location control.
  [ReplyFormat.location]: (message) => {
    if (message.contentType === "location") {
      return fromLocation(message)
    }

    return fromTextWhenAttachmentAbsent(asCoordinatePair)(message)
  },
  [ReplyFormat.date]: fromTextWhenAttachmentAbsent(asIsoDate),
  [ReplyFormat.datetime]: fromTextWhenAttachmentAbsent(asIsoDate),
  [ReplyFormat.anyInput]: firstAccepted(
    fromAttachment(() => true),
    fromLocation,
    fromText(asIs),
  ),
}

export function validateReplyInput(
  replyFormat: ReplyFormatValue,
  message: ReplyInputMessage,
): ReplyValidationResult {
  return replyFormatValidators[replyFormat](message)
}
