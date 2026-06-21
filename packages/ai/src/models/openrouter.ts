import { z } from "zod"
import type { AiChatModelOption } from "./registry"

export const openrouterModels = z.enum([
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "anthropic/claude-opus-4.8",
  "anthropic/claude-opus-4.8-fast",
  "anthropic/claude-fable-5",
  "google/gemini-3.5-flash",
  "google/gemini-2.5-pro",
  "meta-llama/llama-3.3-70b-instruct",
  "deepseek/deepseek-chat",
  "qwen/qwen-2.5-72b-instruct",
  "mistralai/mistral-large",
  "x-ai/grok-4.3",
])
export type OpenRouterModel = z.infer<typeof openrouterModels>

export const openrouterModelOptions: AiChatModelOption[] = [
  { label: "GPT-4o", value: "openai/gpt-4o" },
  { label: "GPT-4o Mini", value: "openai/gpt-4o-mini" },
  { label: "Claude Opus 4.8", value: "anthropic/claude-opus-4.8" },
  { label: "Claude Opus 4.8 Fast", value: "anthropic/claude-opus-4.8-fast" },
  { label: "Claude Fable 5", value: "anthropic/claude-fable-5" },
  { label: "Gemini 3.5 Flash", value: "google/gemini-3.5-flash" },
  { label: "Gemini 2.5 Pro", value: "google/gemini-2.5-pro" },
  { label: "Llama 3.3 70B", value: "meta-llama/llama-3.3-70b-instruct" },
  { label: "DeepSeek V3", value: "deepseek/deepseek-chat" },
  { label: "Qwen 2.5 72B", value: "qwen/qwen-2.5-72b-instruct" },
  { label: "Mistral Large", value: "mistralai/mistral-large" },
  { label: "Grok 4.3", value: "x-ai/grok-4.3" },
]

export const openrouterAnalyzeImageModelOptions: AiChatModelOption[] = [
  { label: "GPT-4o", value: "openai/gpt-4o" },
  { label: "GPT-4o Mini", value: "openai/gpt-4o-mini" },
  { label: "Claude Opus 4.8", value: "anthropic/claude-opus-4.8" },
  { label: "Gemini 3.5 Flash", value: "google/gemini-3.5-flash" },
  { label: "Gemini 2.5 Pro", value: "google/gemini-2.5-pro" },
  {
    label: "Llama 3.2 90B Vision",
    value: "meta-llama/llama-3.2-90b-vision-instruct",
  },
]
