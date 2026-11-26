import { isSameLanguage } from "@chatbotx.io/business"
import type { ConversationModel } from "@chatbotx.io/database/types"
import type { z } from "zod"
import type { PreviewTranslationRequest } from "../schema/action"
import type { translationPreviewResource } from "../schema/resource"
import {
  conversationTranslation,
  isTranslationEffectiveFor,
  loadTranslationContext,
} from "./availability"
import { translationException } from "./errors"
import {
  INTERACTIVE_TRANSLATION_TIMEOUT_MS,
  translateText,
} from "./translate-text"

type TranslationPreviewResource = z.infer<typeof translationPreviewResource>

/**
 * What the customer would receive for `text` in this conversation: the same
 * translation an outgoing message gets, without sending anything. Throws a
 * translation error instead of falling back, so a caller sees why.
 */
export async function previewTranslation(props: {
  workspaceId: string
  conversation: Pick<ConversationModel, "additionalAttributes">
  request: PreviewTranslationRequest
}): Promise<TranslationPreviewResource> {
  const { workspaceId, conversation, request } = props
  const { settings, workspaceLanguage } =
    await loadTranslationContext(workspaceId)
  if (!isTranslationEffectiveFor(settings, conversation)) {
    throw translationException("disabled")
  }
  const targetLanguage = conversationTranslation(conversation)?.language
  if (!targetLanguage) {
    throw translationException("unknownLanguage")
  }
  if (isSameLanguage(targetLanguage, workspaceLanguage)) {
    return {
      translatedText: request.text,
      sourceLanguage: workspaceLanguage,
      targetLanguage,
    }
  }

  const result = await translateText({
    workspaceId,
    modelConfig: settings?.modelConfig ?? null,
    text: request.text,
    targetLanguage,
    timeoutMs: INTERACTIVE_TRANSLATION_TIMEOUT_MS,
  })
  if (!result.ok) {
    throw translationException(result.code)
  }
  return {
    translatedText: result.text,
    sourceLanguage: workspaceLanguage,
    targetLanguage,
  }
}
