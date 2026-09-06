import { aiTimeouts } from "@chatbotx.io/ai"
import { aiIntegrationService, getAIModel } from "@chatbotx.io/ai/server"
import type { AISpeechToTextSchema } from "@chatbotx.io/flow-config"
import { experimental_transcribe as transcribe } from "ai"
import { z } from "zod"
import { env } from "../../env"
import type { HeavyStepComputeProps } from "../../integration/handlers/flow-utils"
import { readCustomFieldValue } from "../../integration/utils/contact"
import { downloadWithByteLimit } from "./bounded-download"
import { ExpectedHeavyStepError } from "./errors"

const supportedAudioMimeTypes = z.enum([
  "audio/flac",
  "audio/mpeg",
  "audio/mpga",
  "audio/m4a",
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
      throw new ExpectedHeavyStepError("AI integration not found")
    }

    const openaiProvider = getAIModel(aiConfig, "openai")
    const audioUrl = await readCustomFieldValue({
      customFieldId: step.inputFieldId,
      contactId: conversation.contactId,
    })

    if (!audioUrl) {
      throw new ExpectedHeavyStepError("No audio URL provided")
    }

    if (!("transcription" in openaiProvider)) {
      throw new ExpectedHeavyStepError(
        `Provider ${step.provider} does not support transcription`,
      )
    }

    const audio = await downloadWithByteLimit({
      allowedMimeTypes: new Set(supportedAudioMimeTypes.options),
      label: "audio",
      maxBytes: env.HEAVY_MAX_AUDIO_BYTES,
      signal: controller.signal,
      url: audioUrl,
    })

    const transcript = await transcribe({
      model: openaiProvider.transcription(step.model),
      audio: new Uint8Array(audio.buffer),
      abortSignal: controller.signal,
    })

    return transcript.text
  } finally {
    clearTimeout(timeoutId)
  }
}
