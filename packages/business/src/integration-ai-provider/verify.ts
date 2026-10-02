import ky, { HTTPError } from "ky"

const VERIFY_TIMEOUT_MS = 10_000
const UNAUTHORIZED_STATUSES = new Set([401, 403])

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
  url: (apiKey: string) => string
  headers?: (apiKey: string) => Record<string, string>
}

// Lightweight "list models" probes used purely to validate an API key.
const verifyConfigByProvider: Record<AiKeyProvider, VerifyConfig> = {
  claude: {
    url: () => "https://api.anthropic.com/v1/models",
    headers: (apiKey) => ({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    }),
  },
  deepseek: {
    url: () => "https://api.deepseek.com/models",
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
    }),
  },
  gemini: {
    url: (apiKey) =>
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  },
  openai: {
    url: () => "https://api.openai.com/v1/models",
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
    }),
  },
  openrouter: {
    url: () => "https://openrouter.ai/api/v1/key",
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
    }),
  },
}

/**
 * Verifies an AI provider API key by calling its public "list models" endpoint.
 *
 * Returns `false` only when the provider explicitly rejects the credentials
 * (HTTP 401/403). Transient failures (timeouts, rate limits, 5xx, network
 * errors) intentionally return `true`: we cannot prove the key is invalid, and
 * blocking the user on an unrelated outage would be a false negative.
 */
export async function verifyAiProviderApiKey(
  provider: AiKeyProvider,
  apiKey: string,
): Promise<boolean> {
  const config = verifyConfigByProvider[provider]

  try {
    await ky.get(config.url(apiKey), {
      headers: config.headers?.(apiKey),
      timeout: VERIFY_TIMEOUT_MS,
      retry: 0,
    })
    return true
  } catch (error) {
    if (error instanceof HTTPError) {
      return !UNAUTHORIZED_STATUSES.has(error.response.status)
    }
    return true
  }
}
