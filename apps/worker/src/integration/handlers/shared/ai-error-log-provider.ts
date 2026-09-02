import type { AIProvider } from "@chatbotx.io/ai"
import type { ErrorLogProvider } from "@chatbotx.io/utils/error-log"

/**
 * The provider an AI step's failure is attributed to in `ErrorLog`.
 *
 * Every AI step carries the vendor it ran against (`step.provider`), so a
 * Claude 401 must not be written as an OpenAI failure — mis-attribution is the
 * one thing this table exists to avoid. `openaiCompatible` maps to its own
 * value rather than folding into `openai`: a self-hosted or third-party
 * OpenAI-shaped endpoint is not OpenAI, and its failures are the workspace's
 * own to fix.
 *
 * Typed as a total `Record` on purpose — a new `aiProviders` value fails to
 * compile here until it is given an `ErrorLog` provider, which is the only
 * thing that keeps the two enums from drifting silently.
 */
const aiErrorLogProviders = {
  openai: "openai",
  gemini: "gemini",
  claude: "claude",
  deepseek: "deepseek",
  openrouter: "openrouter",
  openaiCompatible: "openai-compatible",
} as const satisfies Record<AIProvider | "openaiCompatible", ErrorLogProvider>

export type AIStepProvider = keyof typeof aiErrorLogProviders

export const aiErrorLogProvider = (
  provider: AIStepProvider,
): ErrorLogProvider => aiErrorLogProviders[provider]
