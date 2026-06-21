import { aiTimeouts } from "@chatbotx.io/ai"
import { aiIntegrationService, getAIModel } from "@chatbotx.io/ai/server"
import type { AISpeechToTextSchema } from "@chatbotx.io/flow-config"
import { experimental_transcribe as transcribe } from "ai"
import ky from "ky"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { logger } from "../../../lib/logger"
import {
  readCustomFieldValue,
  saveResultToCustomField,
} from "../../utils/contact"
import type { ExecuteStepProps } from "../flow"
import type { ExecuteStepResult } from "../step"

const supportedAudioMimeTypes = z.enum([
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "audio/x-wav",
  "audio/mp3",
])

export async function handleAISpeechToText({
  conversation,
  step,
}: ExecuteStepProps<AISpeechToTextSchema>): Promise<ExecuteStepResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)

  try {
    const aiConfig = await aiIntegrationService.findBy({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      return {
        status: "error",
        errorMessage: "AI integration not found",
        result: null,
      }
    }

    const openaiProvider = getAIModel(aiConfig, "openai")

    // Resolve Audio URL
    const audioUrl = await readCustomFieldValue({
      customFieldId: step.inputFieldId,
      contactId: conversation.contactId,
    })

    if (!audioUrl) {
      return {
        status: "error",
        errorMessage: "No audio URL provided",
        result: null,
      }
    }

    if (!("transcription" in openaiProvider)) {
      throw new Error(
        `Provider ${step.provider} does not support transcription`,
      )
    }

    const audioResponse = await ky.get(audioUrl, {
      signal: controller.signal,
      throwHttpErrors: false,
    })
    const rawContentType = audioResponse.headers.get("content-type") ?? ""
    const contentType = rawContentType.split(";")[0]?.trim() ?? ""

    if (
      !(
        contentType &&
        (supportedAudioMimeTypes.options as string[]).includes(contentType)
      )
    ) {
      return {
        status: "error",
        errorMessage: `Unsupported audio format: ${rawContentType || "unknown"}`,
        result: null,
      }
    }

    const audioBuffer = await audioResponse.arrayBuffer()

    const transcript = await transcribe({
      model: openaiProvider.transcription(step.model),
      audio: new Uint8Array(audioBuffer),
      abortSignal: controller.signal,
    })

    if (step.outputFieldId) {
      await saveResultToCustomField({
        contactId: conversation.contactId,
        customFieldId: step.outputFieldId,
        fullText: transcript.text,
        workspaceId: conversation.workspaceId,
      })
    }

    return { status: "success", result: null }
  } catch (err) {
    const error = normalizeError(err)
    logger.error(error, "[ai-speech-to-text] Step failed")
    return { status: "error", errorMessage: error.message, result: null }
  } finally {
    clearTimeout(timeoutId)
  }
}
