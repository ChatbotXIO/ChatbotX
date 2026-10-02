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
    if (!(await verifyAiProviderApiKey(provider, apiKey))) {
      throw new Error(`Invalid ${displayName} API key`)
    }
    return secretTextAuth(apiKey)
  },
  verify: async ({ auth }) => {
    const ok = await verifyAiProviderApiKey(provider, auth.secretText)
    return ok
      ? { ok: true }
      : { ok: false, revoked: true, error: "Invalid API key" }
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

export type OpenaiCompatibleCredentials = { apiKey: string; baseURL: string }

/**
 * OpenAI-compatible presets have no fixed provider host, so verification
 * calls the user-supplied `baseURL`'s `/models` endpoint directly (the same
 * OpenAI-style contract every compatible provider implements) rather than
 * reusing `verifyAiProviderApiKey`'s fixed per-provider URL table.
 */
export const openaiCompatibleConnectionProvider: ConnectionProvider<
  SecretTextAuthValue,
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
    return secretTextAuth(apiKey)
  },
  verify: ({ auth }) => {
    // `auth` alone has no `baseURL` (it lives on the DB row's own column,
    // not the auth jsonb) — a real health check needs that row's
    // `baseURL` alongside `auth.secretText`. `ConnectionProvider.verify`'s
    // signature (`Handler<{auth}, ConnectionHealth>`) has no room for it:
    // `ConnectionService.verify`/`ConnectionService.refresh` only ever load
    // and pass `auth`, never the satellite row's other columns, for any
    // provider. Still unwired — treat presence of a stored secret as
    // sufficient until either `baseURL` moves into `auth` itself or
    // `verify`'s signature grows a second, store-row parameter.
    return Promise.resolve(
      auth.secretText
        ? { ok: true as const }
        : { ok: false as const, revoked: true, error: "Missing API key" },
    )
  },
  isRevokedTokenError: () => false,
}

const verifyOpenaiCompatibleEndpoint = async (
  baseURL: string,
  apiKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    await ky.get(`${baseURL.replace(TRAILING_SLASH_RE, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: OPENAI_COMPATIBLE_VERIFY_TIMEOUT_MS,
      retry: 0,
    })
    return { ok: true }
  } catch (error) {
    // Every branch below fails closed: a baseURL the caller can't reach —
    // wrong host (DNS), wrong path (404), or a provider that never answers
    // (timeout) — is exactly as unverifiable as a rejected credential, and
    // must not report `ok: true`. Only a genuine 401/403 gets the more
    // specific "Invalid API key" message; every other failure still
    // reports `ok: false` so `fromCredentials` rejects the connect and
    // `verify` surfaces the health check as failing.
    if (isHTTPError(error)) {
      const { status } = error.response
      if (status === 401 || status === 403) {
        return { ok: false, error: "Invalid API key" }
      }
      return {
        ok: false,
        error: `Unexpected response from the endpoint (HTTP ${status})`,
      }
    }
    if (isTimeoutError(error)) {
      return { ok: false, error: "The endpoint did not respond in time" }
    }
    if (isNetworkError(error)) {
      return { ok: false, error: "Unable to reach the endpoint" }
    }
    return { ok: false, error: "Unable to verify the endpoint" }
  }
}
