import type { AIModelCapabilities, BaseAIModel } from "../config"

export const openAILanguageModels: AIModelCapabilities[] = [
  {
    value: "gpt-4.1",
    label: "GPT-4.1",
    imageInput: true,
    audioInput: false,
    objectGeneration: true,
    toolUsage: true,
  },
  {
    value: "gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    imageInput: true,
    audioInput: false,
    objectGeneration: true,
    toolUsage: true,
  },
  {
    value: "gpt-4.1-nano",
    label: "GPT-4.1 Nano",
    imageInput: true,
    audioInput: false,
    objectGeneration: true,
    toolUsage: true,
  },
  {
    value: "gpt-4o",
    label: "GPT-4o",
    imageInput: true,
    audioInput: false,
    objectGeneration: true,
    toolUsage: true,
  },
  {
    value: "gpt-4o-mini",
    label: "GPT-4o Mini",
    imageInput: true,
    audioInput: false,
    objectGeneration: true,
    toolUsage: true,
  },
  {
    value: "gpt-4o-audio-preview",
    label: "GPT-4o Audio Preview",
    imageInput: false,
    audioInput: true,
    objectGeneration: true,
    toolUsage: true,
  },
  {
    value: "gpt-4-turbo",
    label: "GPT-4 Turbo",
    imageInput: true,
    audioInput: false,
    objectGeneration: true,
    toolUsage: true,
  },
  {
    value: "gpt-4",
    label: "GPT-4",
    imageInput: false,
    audioInput: false,
    objectGeneration: true,
    toolUsage: true,
  },
  {
    value: "gpt-3.5-turbo",
    label: "GPT-3.5 Turbo",
    imageInput: false,
    audioInput: false,
    objectGeneration: true,
    toolUsage: true,
  },
  {
    value: "o1",
    label: "O1",
    imageInput: true,
    audioInput: false,
    objectGeneration: true,
    toolUsage: true,
  },
  {
    value: "o3-mini",
    label: "O3 Mini",
    imageInput: false,
    audioInput: false,
    objectGeneration: true,
    toolUsage: true,
  },
  {
    value: "o3",
    label: "O3",
    imageInput: true,
    audioInput: false,
    objectGeneration: true,
    toolUsage: true,
  },
  {
    value: "o4-mini",
    label: "O4 Mini",
    imageInput: true,
    audioInput: false,
    objectGeneration: true,
    toolUsage: true,
  },
  {
    value: "chatgpt-4o-latest",
    label: "ChatGPT-4o Latest",
    imageInput: true,
    audioInput: false,
    objectGeneration: false,
    toolUsage: false,
  },
  {
    value: "gpt-5",
    label: "GPT-5",
    imageInput: true,
    audioInput: false,
    objectGeneration: true,
    toolUsage: true,
  },
  {
    value: "gpt-5-mini",
    label: "GPT-5 Mini",
    imageInput: true,
    audioInput: false,
    objectGeneration: true,
    toolUsage: true,
  },
  {
    value: "gpt-5-nano",
    label: "GPT-5 Nano",
    imageInput: true,
    audioInput: false,
    objectGeneration: true,
    toolUsage: true,
  },
  {
    value: "gpt-5-chat-latest",
    label: "GPT-5 Chat Latest",
    imageInput: true,
    audioInput: false,
    objectGeneration: false,
    toolUsage: false,
  },
]

export type OPENAI_LANGUAGE_MODEL =
  | "gpt-4.1"
  | "gpt-4.1-mini"
  | "gpt-4.1-nano"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4o-audio-preview"
  | "gpt-4-turbo"
  | "gpt-4"
  | "gpt-3.5-turbo"
  | "o1"
  | "o3-mini"
  | "o3"
  | "o4-mini"
  | "chatgpt-4o-latest"
  | "gpt-5"
  | "gpt-5-mini"
  | "gpt-5-nano"
  | "gpt-5-chat-latest"

export const OPENAI_DEFAULT_LANGUAGE_MODEL = "gpt-4o"

export const OPENAI_EMBEDDING_MODELS: BaseAIModel[] = [
  {
    value: "text-embedding-3-large",
    label: "Text Embedding 3 Large",
  },
  {
    value: "text-embedding-3-small",
    label: "Text Embedding 3 Small",
  },
  {
    value: "text-embedding-ada-002",
    label: "Text Embedding Ada 002",
  },
]

export const OPENAI_IMAGE_MODELS: BaseAIModel[] = [
  {
    value: "gpt-image-1",
    label: "GPT-Image 1",
  },
  {
    value: "dall-e-3",
    label: "Dall-E 3",
  },
  {
    value: "dall-e-2",
    label: "Dall-E 2",
  },
]

export const OPENAI_TRANSCRIPTION_MODELS: BaseAIModel[] = [
  {
    value: "whisper-1",
    label: "Whisper 1",
  },
  {
    value: "gpt-4o-mini-transcribe",
    label: "GPT-4o Mini Transcribe",
  },
  {
    value: "gpt-4o-transcribe",
    label: "GPT-4o Transcribe",
  },
]

export const OPENAI_SPEECH_MODELS: BaseAIModel[] = [
  {
    value: "tts-1",
    label: "TTS 1",
  },
  {
    value: "tts-1-hd",
    label: "TTS 1 HD",
  },
  {
    value: "gpt-4o-mini-tts",
    label: "GPT-4o Mini TTS",
  },
]
