import { aiTimeouts } from "@chatbotx.io/ai"
import { aiIntegrationService, getAIModel } from "@chatbotx.io/ai/server"
import type { AITextToSpeechSchema } from "@chatbotx.io/flow-config"
import {
  experimental_generateSpeech as generateSpeech,
  NoSpeechGeneratedError,
} from "ai"
import { normalizeError } from "universal-error-normalizer"
import type { HeavyStepComputeProps } from "../../integration/handlers/flow-utils"
import { textToSpeechStorageService } from "../../integration/handlers/text-to-speech/storage"
import { logger } from "../../lib/logger"
import { ExpectedHeavyStepError } from "./errors"

function getExecutionId(
  metadataStepId: string | undefined,
  stepId: string,
): string {
  return metadataStepId ?? stepId
}

export async function textToSpeechOutput({
  conversation,
  metadata,
  step,
}: HeavyStepComputeProps<AITextToSpeechSchema>): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)

  try {
    const aiConfig = await aiIntegrationService.findBy({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      logger.warn(
        { workspaceId: conversation.workspaceId, provider: step.provider },
        "[ai-text-to-speech] AI configuration not found",
      )
      throw new ExpectedHeavyStepError("AI integration not found")
    }

    const openaiProvider = getAIModel(aiConfig, "openai")

    if (!("speech" in openaiProvider)) {
      throw new ExpectedHeavyStepError(
        `Provider ${step.provider} does not support text-to-speech`,
      )
    }

    const result = await generateSpeech({
      model: openaiProvider.speech(step.model),
      text: step.message,
      voice: step.voiceType,
      abortSignal: controller.signal,
      instructions:
        step.model === "gpt-4o-mini-tts"
          ? step.voiceTone || undefined
          : undefined,
    })

    const audioData =
      result.audio.uint8Array && result.audio.uint8Array.byteLength > 0
        ? result.audio.uint8Array
        : result.audio.base64

    if (!audioData) {
      throw new Error("[ai-text-to-speech] Empty audio payload from provider")
    }

    const audioOutput = await textToSpeechStorageService.saveAudio({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      executionId: getExecutionId(metadata?.stepId, step.id),
      audioData,
      mediaType: result.audio.mediaType,
    })

    return audioOutput.publicUrl
  } catch (err) {
    if (err instanceof NoSpeechGeneratedError) {
      logger.error(
        {
          conversationId: conversation.id,
          err: normalizeError(err),
          model: step.model,
          provider: step.provider,
          workspaceId: conversation.workspaceId,
        },
        "[ai-text-to-speech] No speech generated",
      )
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}
