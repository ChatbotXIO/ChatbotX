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

export const aiTextToSpeechModelTypes = z.enum([
  "gpt-4o-mini-tts",
  "tts-1",
  "tts-1-hd",
])
export type AITextToSpeechModelType = z.infer<typeof aiTextToSpeechModelTypes>

export const aiTextToSpeechVoiceTypes = z.enum([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
])
export type AITextToSpeechVoiceType = z.infer<typeof aiTextToSpeechVoiceTypes>

export const aiTextToSpeechSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiTextToSpeech),
  provider: z.literal("openai"),
  model: aiTextToSpeechModelTypes,
  // Persisted flow versions predate OpenAI's 4,096-character input limit.
  // Keep this boundary backward-compatible; the editor rejects newly edited
  // over-limit messages while existing flows remain readable.
  message: z.string().trim().min(1),
  voiceType: aiTextToSpeechVoiceTypes,
  voiceTone: z.string().trim().optional(),
  outputFieldId: zodFieldReference(),
  states: z.tuple([successStateSchema, errorStateSchema]).optional(),
})

export type AITextToSpeechSchema = z.infer<typeof aiTextToSpeechSchema>

export const AI_TEXT_TO_SPEECH_BASE64_ENCODING = "base64" as const
export const AI_TEXT_TO_SPEECH_DEFAULT_MIME_TYPE = "audio/mpeg" as const
export const AI_TEXT_TO_SPEECH_DEFAULT_EXTENSION = "mp3" as const
export const AI_TEXT_TO_SPEECH_MESSAGE_MAX_LENGTH = 4096

export type GetAITextToSpeechAudioPathProps = {
  storagePrefix: string
  fileName: string
}

export const getAITextToSpeechAudioPath = ({
  storagePrefix,
  fileName,
}: GetAITextToSpeechAudioPathProps): string => `${storagePrefix}/${fileName}`

export const AITextToSpeechDefaultFn = (
  props?: Partial<AITextToSpeechSchema>,
): AITextToSpeechSchema => ({
  id: createId(),
  provider: "openai",
  model: aiTextToSpeechModelTypes.enum["gpt-4o-mini-tts"],
  message: "",
  voiceType: aiTextToSpeechVoiceTypes.enum.alloy,
  voiceTone: "",
  outputFieldId: "",
  ...props,
  stepType: stepTypes.enum.aiTextToSpeech,
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})
