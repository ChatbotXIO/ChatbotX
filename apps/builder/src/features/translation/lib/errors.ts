import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  TRANSLATION_API_ERRORS,
  TRANSLATION_NOT_SENT_CODE,
  TRANSLATION_NOT_SENT_ERROR,
  type TranslationApiErrorCode,
  type TranslationNotSentData,
} from "../schema/errors"

export const translationException = (
  code: TranslationApiErrorCode,
): ChatbotXException => {
  const { message, code: exceptionCode, status } = TRANSLATION_API_ERRORS[code]
  return new ChatbotXException(message, exceptionCode, status)
}

/**
 * A send with `translate: true` that was not sent because its text could not be
 * translated. `data` (reason, whether translation was turned off) reaches the
 * public API as the structured `translationNotSent` error.
 */
export class TranslationNotSentException extends ChatbotXException {
  readonly reason: TranslationApiErrorCode
  readonly conversationTranslation: TranslationNotSentData["conversationTranslation"]

  constructor(data: TranslationNotSentData) {
    super(
      TRANSLATION_NOT_SENT_ERROR.message,
      TRANSLATION_NOT_SENT_CODE,
      TRANSLATION_NOT_SENT_ERROR.status,
    )
    this.reason = data.reason
    this.conversationTranslation = data.conversationTranslation
    this.data = { ...data }
  }
}
