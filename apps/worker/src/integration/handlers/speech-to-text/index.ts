import { aiTimeouts } from "@chatbotx.io/ai"
import { aiIntegrationService, getAIModel } from "@chatbotx.io/ai/server"
import { db } from "@chatbotx.io/database/client"
import type { AISpeechToTextSchema } from "@chatbotx.io/flow-config"
import { experimental_transcribe as transcribe } from "ai"
import ky from "ky"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { logger } from "../../../lib/logger"
import { saveResultToCustomField } from "../../utils/contact"
import { sendMessageWithRender } from "../../utils/message"
import type { ExecuteStepProps } from "../flow"

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
}: ExecuteStepProps<AISpeechToTextSchema>) {
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
        "[ai-speech-to-text] AI configuration not found",
      )
      return
    }

    const openaiProvider = getAIModel(aiConfig, "openai", {
      abortSignal: controller.signal,
    })

    // Resolve Audio URL
    const audioUrl = await getCustomFieldValue(
      step.inputFieldId,
      conversation.contactId,
    )

    if (!audioUrl) {
      await sendMessageWithRender(conversation.id, "No audio URL provided")
      return
    }

    const response = await ky.head(audioUrl, {
      signal: controller.signal,
      throwHttpErrors: false,
    })
    const contentType = response.headers.get("content-type")

    if (
      !(
        contentType &&
        (supportedAudioMimeTypes.options as string[]).includes(contentType)
      )
    ) {
      await sendMessageWithRender(
        conversation.id,
        `Unsupported audio format: ${contentType || "unknown"}. Supported formats: ${supportedAudioMimeTypes.options.join(", ")}`,
      )
      return
    }

    if (!("transcription" in openaiProvider)) {
      throw new Error(
        `Provider ${step.provider} does not support transcription`,
      )
    }

    const transcript = await transcribe({
      model: openaiProvider.transcription(step.model),
      audio: new URL(audioUrl),
      abortSignal: controller.signal,
    })

    await sendMessageWithRender(conversation.id, transcript.text)

    if (step.outputFieldId) {
      await saveResultToCustomField({
        contactId: conversation.contactId,
        customFieldId: step.outputFieldId,
        fullText: transcript.text,
        workspaceId: conversation.workspaceId,
      })
    }
  } catch (error) {
    const parsedError = normalizeError(error)
    logger.error(parsedError, "[ai-speech-to-text] Step failed")

    await sendMessageWithRender(
      conversation.id,
      "Error converting speech to text",
    )

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function getCustomFieldValue(
  customFieldId: string,
  contactId: string,
): Promise<string | null> {
  const customField = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId,
      customFieldId,
    },
  })

  return customField?.value || null
}
