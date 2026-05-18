import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
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
])
export type AITextToSpeechVoiceType = z.infer<typeof aiTextToSpeechVoiceTypes>

export const aiTextToSpeechSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiTextToSpeech),
  provider: z.literal("openai"),
  model: aiTextToSpeechModelTypes,
  message: z.string().trim().min(1),
  voiceType: aiTextToSpeechVoiceTypes,
  voiceTone: z.string().trim().optional(),
  outputFieldId: z.string().trim().min(1),
})

export type AITextToSpeechSchema = z.infer<typeof aiTextToSpeechSchema>

export const AI_TEXT_TO_SPEECH_BASE64_ENCODING = "base64" as const
export const AI_TEXT_TO_SPEECH_DEFAULT_MIME_TYPE = "audio/mpeg" as const
export const AI_TEXT_TO_SPEECH_DEFAULT_EXTENSION = "mp3" as const

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
  stepType: stepTypes.enum.aiTextToSpeech,
  message: "",
  voiceType: aiTextToSpeechVoiceTypes.enum.alloy,
  voiceTone: "",
  outputFieldId: "",
  ...props,
})
