import { aiTimeouts } from "@chatbotx.io/ai"
import { aiIntegrationService, getAIModel } from "@chatbotx.io/ai/server"
import type { AISpeechToTextSchema } from "@chatbotx.io/flow-config"
import { experimental_transcribe as transcribe } from "ai"
import ky from "ky"
import { z } from "zod"
import type { HeavyStepComputeProps } from "../../integration/handlers/flow-utils"
import { readCustomFieldValue } from "../../integration/utils/contact"

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

export async function speechToTextOutput({
  conversation,
  step,
}: HeavyStepComputeProps<AISpeechToTextSchema>): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)

  try {
    const aiConfig = await aiIntegrationService.findBy({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      throw new Error("AI integration not found")
    }

    const openaiProvider = getAIModel(aiConfig, "openai")
    const audioUrl = await readCustomFieldValue({
      customFieldId: step.inputFieldId,
      contactId: conversation.contactId,
    })

    if (!audioUrl) {
      throw new Error("No audio URL provided")
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
      throw new Error(
        `Unsupported audio format: ${rawContentType || "unknown"}`,
      )
    }

    const audioBuffer = await audioResponse.arrayBuffer()

    const transcript = await transcribe({
      model: openaiProvider.transcription(step.model),
      audio: new Uint8Array(audioBuffer),
      abortSignal: controller.signal,
    })

    return transcript.text
  } finally {
    clearTimeout(timeoutId)
  }
}
