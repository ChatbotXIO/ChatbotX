import { type AIProvider, aiProviders } from "../schemas/ai-model"
import { claudeModelOptions, claudeModels } from "./claude"
import { deepseekModelOptions, deepseekModels } from "./deepseek"
import { geminiModelOptions, geminiModels } from "./gemini"
import { openaiModelOptions, openaiModels } from "./openai"
import { openrouterModelOptions, openrouterModels } from "./openrouter"

export type AiChatModelOption = { label: string; value: string }

/**
 * Client-safe descriptor for an AI chat provider, used to drive the AI agent
 * model selectors and connect forms from a single source of truth. Adding a
 * new provider here automatically surfaces it in the agent model picker.
 */
export type AiChatProviderConfig = {
  provider: AIProvider
  modelOptions: AiChatModelOption[]
  defaultModel: string
}

/**
 * Ordered list of selectable chat providers. Order matters: the AI agent
 * runtime tries each provider in this order and uses the first one that has a
 * connected, auto-reply-enabled integration. Keep gemini/openai first to
 * preserve existing fallback priority.
 */
export const aiChatProviders: readonly AiChatProviderConfig[] = [
  {
    provider: aiProviders.enum.gemini,
    modelOptions: geminiModelOptions,
    defaultModel: geminiModels.enum["gemini-3.5-flash"],
  },
  {
    provider: aiProviders.enum.openai,
    modelOptions: openaiModelOptions,
    defaultModel: openaiModels.enum["gpt-5.4-mini"],
  },
  {
    provider: aiProviders.enum.claude,
    modelOptions: claudeModelOptions,
    defaultModel: claudeModels.enum["claude-sonnet-4-6"],
  },
  {
    provider: aiProviders.enum.deepseek,
    modelOptions: deepseekModelOptions,
    defaultModel: deepseekModels.enum["deepseek-v4-flash"],
  },
  {
    provider: aiProviders.enum.openrouter,
    modelOptions: openrouterModelOptions,
    defaultModel: openrouterModels.enum["openai/gpt-5.4-mini"],
  },
]
