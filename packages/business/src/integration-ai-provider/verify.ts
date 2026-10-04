import { toLogSafeError } from "@chatbotx.io/logger"
import ky, { HTTPError } from "ky"
import { logger } from "../logger"

const VERIFY_TIMEOUT_MS = 10_000
const UNAUTHORIZED_STATUSES = [401, 403] as const

/**
 * The subset of `IntegrationType` this module can validate a bare API key
 * for. Deliberately a local literal union (not `AIProvider` from
 * `@chatbotx.io/ai`) — that package depends on `@chatbotx.io/business`, so
 * importing it back here would be circular. Every value here is also a real
 * `IntegrationType`.
 */
export type AiKeyProvider =
  | "claude"
  | "deepseek"
  | "gemini"
  | "openai"
  | "openrouter"

type VerifyConfig = {
  url: string
  headers?: (apiKey: string) => Record<string, string>
  invalidStatuses: readonly number[]
}

// Lightweight "list models" probes used purely to validate an API key.
const verifyConfigByProvider: Record<AiKeyProvider, VerifyConfig> = {
  claude: {
    url: "https://api.anthropic.com/v1/models",
    headers: (apiKey) => ({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    }),
    invalidStatuses: UNAUTHORIZED_STATUSES,
  },
  deepseek: {
    url: "https://api.deepseek.com/models",
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
    }),
    invalidStatuses: UNAUTHORIZED_STATUSES,
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    headers: (apiKey) => ({
      "x-goog-api-key": apiKey,
    }),
    invalidStatuses: [400, 401, 403],
  },
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
    }),
    invalidStatuses: UNAUTHORIZED_STATUSES,
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/key",
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
    }),
    invalidStatuses: UNAUTHORIZED_STATUSES,
  },
}

/**
 * Verifies an AI provider API key by calling its public "list models" endpoint.
 *
 * An explicit provider-defined invalid status proves the credentials are
 * invalid. A successful response proves they are valid. Provider outages and
 * unexpected responses remain unknown so callers can accept new credentials
 * without falsely restoring an existing connection to healthy.
 */
export type AiKeyValidation = "valid" | "invalid" | "unknown"

export const verifyAiProviderApiKey = async (
  provider: AiKeyProvider,
  apiKey: string,
): Promise<AiKeyValidation> => {
  const config = verifyConfigByProvider[provider]

  try {
    await ky.get(config.url, {
      headers: config.headers?.(apiKey),
      timeout: VERIFY_TIMEOUT_MS,
      retry: 0,
    })
    return "valid"
  } catch (err) {
    if (
      err instanceof HTTPError &&
      config.invalidStatuses.includes(err.response.status)
    ) {
      return "invalid"
    }
    logger.warn(
      { err: toLogSafeError(err), provider },
      "AI provider API key verification was inconclusive",
    )
    return "unknown"
  }
}
