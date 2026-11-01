import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

import { zodFieldReference } from "../field-reference"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const aiSpeechToTextProviderSchema = z.enum(["openai", "muse"])
export type AISpeechToTextProvider = z.infer<
  typeof aiSpeechToTextProviderSchema
>

export const MUSE_TRANSCRIPTION_MODEL = "muse-voice-transcribe-1.0" as const

export const defaultSpeechToTextModels = {
  openai: "whisper-1",
  muse: MUSE_TRANSCRIPTION_MODEL,
} as const satisfies Record<AISpeechToTextProvider, string>

/** Language names exactly as the Meta ASR `languageBias` field takes them. */
export const museVoiceLanguages = z.enum([
  "Arabic",
  "Bengali",
  "Dutch",
  "English",
  "French",
  "German",
  "Hebrew",
  "Hindi",
  "Indonesian",
  "Italian",
  "Japanese",
  "Kannada",
  "Korean",
  "Malay",
  "Mandarin Chinese",
  "Marathi",
  "Polish",
  "Portuguese",
  "Spanish",
  "Tagalog",
  "Tamil",
  "Telugu",
  "Thai",
  "Turkish",
  "Vietnamese",
])
export type MuseVoiceLanguage = z.infer<typeof museVoiceLanguages>

// Meta does not document these bounds; they are our own request caps.
export const MUSE_TRANSCRIBE_MAX_KEYWORDS = 50
export const MUSE_TRANSCRIBE_MAX_KEYWORD_LENGTH = 100

const baseShape = {
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.aiSpeechToText)
    .describe('Step type discriminator: "aiSpeechToText".'),
  inputFieldId: z
    .string()
    .trim()
    .min(1)
    .describe("Custom field holding the audio file URL."),
  outputFieldId: zodFieldReference().describe(
    "Custom field that receives the transcript.",
  ),
  states: z.tuple([successStateSchema, errorStateSchema]).optional(),
}

export const aiSpeechToTextOpenAISchema = z
  .object({
    ...baseShape,
    provider: z.literal("openai"),
    model: z.string().trim().min(1).describe('OpenAI model, e.g. "whisper-1".'),
    languageBias: z.never().optional(),
    keywords: z.never().optional(),
  })
  .describe(
    "OpenAI transcription. Accepts flac, mp3, mp4, m4a, ogg, wav and webm audio.",
  )

export const aiSpeechToTextMuseSchema = z
  .object({
    ...baseShape,
    provider: z.literal("muse"),
    model: z.literal(MUSE_TRANSCRIPTION_MODEL),
    languageBias: z
      .array(museVoiceLanguages)
      .max(museVoiceLanguages.options.length)
      .optional()
      .describe(
        "Languages to bias recognition toward; omit for automatic detection.",
      ),
    keywords: z
      .array(z.string().trim().min(1).max(MUSE_TRANSCRIBE_MAX_KEYWORD_LENGTH))
      .max(MUSE_TRANSCRIBE_MAX_KEYWORDS)
      .optional()
      .describe("Names or domain terms that guide spelling."),
  })
  .describe(
    "Muse Voice Transcribe. Accepts only WAV (RIFF, PCM 16-bit, mono, 16 or 24 kHz), at most 10 minutes and under 32 MiB. Any other audio (ogg/opus voice notes, mp3, stereo, 44.1/48 kHz) goes to the error state; nothing is converted.",
  )

export const aiSpeechToTextSchema = z.discriminatedUnion("provider", [
  aiSpeechToTextOpenAISchema,
  aiSpeechToTextMuseSchema,
])
export type AISpeechToTextSchema = z.infer<typeof aiSpeechToTextSchema>

export const AISpeechToTextDefaultFn = (
  props: Partial<AISpeechToTextSchema> = {},
): AISpeechToTextSchema => {
  const base = { id: createId(), inputFieldId: "", outputFieldId: "" }
  const fixed = {
    stepType: stepTypes.enum.aiSpeechToText,
    states: [successStateDefaultFn(), errorStateDefaultFn()],
  } satisfies Pick<AISpeechToTextSchema, "stepType" | "states">

  if (props.provider === "muse") {
    return {
      ...base,
      ...props,
      provider: "muse",
      model: props.model ?? defaultSpeechToTextModels.muse,
      ...fixed,
    }
  }

  // Muse-only fields never carry over to an OpenAI step.
  const { keywords: _keywords, languageBias: _languageBias, ...rest } = props
  return {
    ...base,
    ...rest,
    provider: "openai",
    model: rest.model ?? defaultSpeechToTextModels.openai,
    ...fixed,
  }
}
