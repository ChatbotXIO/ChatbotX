import { z } from "zod"
import type { AiChatModelOption } from "./registry"

export const openrouterModels = z.enum([
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "anthropic/claude-3-5-sonnet",
  "anthropic/claude-3-5-haiku",
  "google/gemini-2.0-flash",
  "google/gemini-2.5-pro",
  "meta-llama/llama-3.3-70b-instruct",
  "deepseek/deepseek-chat",
  "qwen/qwen-2.5-72b-instruct",
  "mistralai/mistral-large",
  "x-ai/grok-3",
])
export type OpenRouterModel = z.infer<typeof openrouterModels>

export const openrouterModelOptions: AiChatModelOption[] = [
  { label: "GPT-4o", value: "openai/gpt-4o" },
  { label: "GPT-4o Mini", value: "openai/gpt-4o-mini" },
  { label: "Claude 3.5 Sonnet", value: "anthropic/claude-3-5-sonnet" },
  { label: "Claude 3.5 Haiku", value: "anthropic/claude-3-5-haiku" },
  { label: "Gemini 2.0 Flash", value: "google/gemini-2.0-flash" },
  { label: "Gemini 2.5 Pro", value: "google/gemini-2.5-pro" },
  { label: "Llama 3.3 70B", value: "meta-llama/llama-3.3-70b-instruct" },
  { label: "DeepSeek V3", value: "deepseek/deepseek-chat" },
  { label: "Qwen 2.5 72B", value: "qwen/qwen-2.5-72b-instruct" },
  { label: "Mistral Large", value: "mistralai/mistral-large" },
  { label: "Grok 3", value: "x-ai/grok-3" },
]
