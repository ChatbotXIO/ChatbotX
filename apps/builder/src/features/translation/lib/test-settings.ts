import type { z } from "zod"
import type { TestTranslationSettingsRequest } from "../schema/action"
import type { translationTestResource } from "../schema/resource"
import { loadTranslationContext } from "./availability"
import { translationException } from "./errors"
import {
  INTERACTIVE_TRANSLATION_TIMEOUT_MS,
  OUTBOUND_TRANSLATION_TIMEOUT_MS,
  translateText,
} from "./translate-text"

const DEFAULT_TEST_SAMPLE = "Hola, ¿cómo estás? Quisiera cambiar mi pedido."
/**
 * Slower than this and an outgoing message may miss its 10 s budget (and is
 * then not sent): one sample varies by a few seconds from call to call.
 */
const SLOW_THRESHOLD_MS = OUTBOUND_TRANSLATION_TIMEOUT_MS / 2

type TranslationTestResource = z.infer<typeof translationTestResource>

/**
 * Tries a model on a sample sentence, into the workspace language, with the
 * same translator the Inbox uses. Works on a model that is not saved yet, so
 * the settings form can check a choice before the admin commits it.
 */
export async function testTranslationSettings(props: {
  workspaceId: string
  request: TestTranslationSettingsRequest
}): Promise<TranslationTestResource> {
  const { workspaceId, request } = props
  const sampleText = request.sampleText ?? DEFAULT_TEST_SAMPLE
  const { workspaceLanguage } = await loadTranslationContext(workspaceId)

  const startedAt = Date.now()
  const result = await translateText({
    workspaceId,
    modelConfig: request.modelConfig,
    text: sampleText,
    targetLanguage: workspaceLanguage,
    timeoutMs: INTERACTIVE_TRANSLATION_TIMEOUT_MS,
  })
  if (!result.ok) {
    throw translationException(result.code)
  }
  const latencyMs = Date.now() - startedAt
  return {
    latencyMs,
    slow: latencyMs > SLOW_THRESHOLD_MS,
    sampleText,
    translatedText: result.text,
    targetLanguage: workspaceLanguage,
  }
}
