import { type AIProvider, aiProviders } from "@chatbotx.io/ai"
import ky, { HTTPError } from "ky"

const VERIFY_TIMEOUT_MS = 10_000
const UNAUTHORIZED_STATUSES = new Set([401, 403])

type VerifyConfig = {
  url: string
  headers: (apiKey: string) => Record<string, string>
}

// Lightweight "list models" probes used purely to validate an API key.
const verifyConfigByProvider: Partial<Record<AIProvider, VerifyConfig>> = {
  [aiProviders.enum.claude]: {
    url: "https://api.anthropic.com/v1/models",
    headers: (apiKey) => ({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    }),
  },
  [aiProviders.enum.deepseek]: {
    url: "https://api.deepseek.com/models",
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
    }),
  },
  [aiProviders.enum.openai]: {
    url: "https://api.openai.com/v1/models",
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
  provider: AIProvider,
  apiKey: string,
): Promise<boolean> {
  const config = verifyConfigByProvider[provider]
  if (!config) {
    return true
  }

  try {
    await ky.get(config.url, {
      headers: config.headers(apiKey),
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
