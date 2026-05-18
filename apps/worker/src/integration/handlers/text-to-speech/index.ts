import { aiTimeouts } from "@chatbotx.io/ai"
import { aiIntegrationService, getAIModel } from "@chatbotx.io/ai/server"
import type { AITextToSpeechSchema } from "@chatbotx.io/flow-config"
import {
  experimental_generateSpeech as generateSpeech,
  NoSpeechGeneratedError,
} from "ai"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import { saveResultToCustomField } from "../../utils/contact"
import { sendMessageWithRender } from "../../utils/message"
import type { ExecuteStepProps } from "../flow"
import { textToSpeechStorageService } from "./storage"

function getExecutionId(
  metadataStepId: string | undefined,
  stepId: string,
): string {
  return metadataStepId ?? stepId
}

export async function handleAITextToSpeech({
  conversation,
  metadata,
  step,
}: ExecuteStepProps<AITextToSpeechSchema>) {
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
      return
    }

    const openaiProvider = getAIModel(aiConfig, "openai", {
      abortSignal: controller.signal,
    })

    if (!("speech" in openaiProvider)) {
      throw new Error(
        `Provider ${step.provider} does not support text-to-speech`,
      )
    }

    const result = await generateSpeech({
      model: openaiProvider.speech(step.model),
      text: step.message,
      voice: step.voiceType,
      abortSignal: controller.signal,
      instructions: step.voiceTone || undefined,
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

    await sendMessageWithRender(
      conversation.id,
      audioOutput.publicUrl,
      undefined,
      {
        forceUrl: true,
        storagePath: audioOutput.storagePath,
      },
    )

    if (step.outputFieldId) {
      await saveResultToCustomField({
        contactId: conversation.contactId,
        customFieldId: step.outputFieldId,
        fullText: audioOutput.publicUrl,
        workspaceId: conversation.workspaceId,
      })
    }
  } catch (error) {
    if (error instanceof NoSpeechGeneratedError) {
      logger.error(
        {
          cause: error.cause,
          responses: error.responses,
        },
        "[ai-text-to-speech] No speech generated",
      )
    } else {
      const parsedError = normalizeError(error)
      logger.error(parsedError, "[ai-text-to-speech] Step failed")
    }

    await sendMessageWithRender(
      conversation.id,
      "Error converting text to speech",
    )

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
