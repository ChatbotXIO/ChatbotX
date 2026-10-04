import { toLogSafeError } from "@chatbotx.io/logger"
import {
  AuthType,
  type ConnectionProvider,
  type SecretTextAuthValue,
} from "@chatbotx.io/sdk"
import ky, { isHTTPError, isNetworkError, isTimeoutError } from "ky"
import {
  type AiKeyProvider,
  verifyAiProviderApiKey,
} from "../integration-ai-provider/verify"
import { validateOpenaiCompatibleBaseUrlForEnvironment } from "../integration-openai-compatible/validate-base-url"
import { logger } from "../logger"

/**
 * `claude`/`deepseek`/`gemini`/`openai`/`openrouter`/`openaiCompatible` have
 * no `integrations/<name>` SDK package (see `packages/connections`'s
 * registry note) — they are workspace-scoped API-key credentials with no
 * inbound webhook or message dispatch. Their `ConnectionProvider` lives here
 * instead of a `connection` field on an `IntegrationDefinition`.
 */
const secretTextAuth = (secretText: string): SecretTextAuthValue => ({
  authType: AuthType.secretText,
  secretText,
})

const makeAiKeyProvider = (
  provider: AiKeyProvider,
  displayName: string,
): ConnectionProvider<SecretTextAuthValue, { apiKey: string }> => ({
  kind: "integration",
  strategy: "api_key",
  multiAccount: false,
  configFields: [
    {
      name: "apiKey",
      type: "secret",
      required: true,
      labelKey: `integrations.${provider}.fields.apiKey`,
    },
  ],
  // Auth carries only the secret — there is no external account id or name
  // to surface, so `sourceId` is the workspace singleton and `displayName`
  // is the fixed provider label.
  describe: () => ({ sourceId: "workspace", displayName }),
  fromCredentials: async ({ apiKey }) => {
    const validation = await verifyAiProviderApiKey(provider, apiKey)
    if (validation === "invalid") {
      throw new Error(`Invalid ${displayName} API key`)
    }
    return secretTextAuth(apiKey)
  },
  verify: async ({ auth }) => {
    const validation = await verifyAiProviderApiKey(provider, auth.secretText)
    if (validation === "valid") {
      return { ok: true }
    }
    if (validation === "invalid") {
      return { ok: false, revoked: true, error: "Invalid API key" }
    }
    return { ok: false, revoked: false, error: "Unable to verify API key" }
  },
  // Rejection is detected by the same live "list models" probe used for
  // `verify`/`fromCredentials` (HTTP 401/403) — there is no separate revoked-
  // token error shape for a bare API key, so this always returns `false`;
  // `verify` is what surfaces the unhealthy state.
  isRevokedTokenError: () => false,
})

export const claudeConnectionProvider = makeAiKeyProvider("claude", "Claude")
export const deepseekConnectionProvider = makeAiKeyProvider(
  "deepseek",
  "DeepSeek",
)
export const geminiConnectionProvider = makeAiKeyProvider("gemini", "Gemini")
export const openaiConnectionProvider = makeAiKeyProvider("openai", "OpenAI")
export const openrouterConnectionProvider = makeAiKeyProvider(
  "openrouter",
  "OpenRouter",
)

const OPENAI_COMPATIBLE_VERIFY_TIMEOUT_MS = 10_000
const TRAILING_SLASH_RE = /\/$/

type OpenaiCompatibleCredentials = { apiKey: string; baseURL: string }

type OpenaiCompatibleAuthValue = SecretTextAuthValue & { baseURL: string }

/**
 * OpenAI-compatible presets have no fixed provider host, so verification
 * calls the user-supplied `baseURL`'s `/models` endpoint directly (the same
 * OpenAI-style contract every compatible provider implements) rather than
 * reusing `verifyAiProviderApiKey`'s fixed per-provider URL table.
 */
export const openaiCompatibleConnectionProvider: ConnectionProvider<
  OpenaiCompatibleAuthValue,
  OpenaiCompatibleCredentials
> = {
  kind: "integration",
  strategy: "api_key",
  multiAccount: false,
  configFields: [
    {
      name: "baseURL",
      type: "url",
      required: true,
      labelKey: "integrations.openaiCompatible.fields.baseURL",
    },
    {
      name: "apiKey",
      type: "secret",
      required: true,
      labelKey: "integrations.openaiCompatible.fields.apiKey",
    },
  ],
  describe: () => ({ sourceId: "workspace", displayName: "OpenAI-compatible" }),
  fromCredentials: async ({ apiKey, baseURL }) => {
    // SSRF guard: without this, a workspace token can drive `ky.get` at an
    // arbitrary attacker-chosen host (including internal/metadata
    // addresses like 169.254.169.254), and the distinct error branches
    // below (401/403 vs timeout vs network vs generic) leak enough signal
    // to use this endpoint as a port scanner. The legacy
    // `integration-openai-compatible` connect path already gates on this;
    // this credential-strategy path must too. Use the validated/normalized
    // URL it returns, not the raw input, for the actual probe.
    const validatedBaseUrl =
      await validateOpenaiCompatibleBaseUrlForEnvironment(baseURL)
    const health = await verifyOpenaiCompatibleEndpoint(
      validatedBaseUrl,
      apiKey,
    )
    if (!health.ok) {
      throw new Error(health.error)
    }
    return {
      authType: AuthType.secretText,
      baseURL: validatedBaseUrl,
      secretText: apiKey,
    }
  },
  verify: async ({ auth }) =>
    await verifyOpenaiCompatibleEndpoint(auth.baseURL, auth.secretText),
  isRevokedTokenError: () => false,
}

const verifyOpenaiCompatibleEndpoint = async (
  baseURL: string,
  apiKey: string,
): Promise<{ ok: true } | { ok: false; error: string; revoked: boolean }> => {
  try {
    await ky.get(`${baseURL.replace(TRAILING_SLASH_RE, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: OPENAI_COMPATIBLE_VERIFY_TIMEOUT_MS,
      retry: 0,
      redirect: "manual",
    })
    return { ok: true }
  } catch (err) {
    logger.warn(
      { err: toLogSafeError(err) },
      "OpenAI-compatible endpoint verification failed",
    )
    // Every branch below fails closed: a baseURL the caller cannot reach —
    // wrong host, wrong path, or an unresponsive provider — is unhealthy.
    // A genuine 401 is terminally revoked; every other failure is retryable.
    if (isHTTPError(err)) {
      const { status } = err.response
      if (status === 401) {
        return { ok: false, revoked: true, error: "Invalid API key" }
      }
      if (status === 403) {
        return { ok: false, revoked: false, error: "Invalid API key" }
      }
      if (status >= 300 && status < 400) {
        return { ok: false, revoked: false, error: "Unexpected redirect" }
      }
      return {
        ok: false,
        revoked: false,
        error: `Unexpected response from the endpoint (HTTP ${status})`,
      }
    }
    if (isTimeoutError(err)) {
      return {
        ok: false,
        revoked: false,
        error: "The endpoint did not respond in time",
      }
    }
    if (isNetworkError(err)) {
      return {
        ok: false,
        revoked: false,
        error: "Unable to reach the endpoint",
      }
    }
    return { ok: false, revoked: false, error: "Unable to verify the endpoint" }
  }
}
