import { getChildLogger } from "@chatbotx.io/logger"
import { z } from "zod"
import { env } from "./env"
import { fetchWithTimeout } from "./http"

const logger = getChildLogger("mcp-server")
const tokenIntrospectionSchema = z.object({
  workspaceId: z.string(),
  permission: z.enum(["read_only", "full"]),
  scopes: z.array(z.string()).nullable(),
})

export type TokenIntrospection = z.infer<typeof tokenIntrospectionSchema>
export type IntrospectionResult =
  | { status: "ok"; data: TokenIntrospection }
  | { status: "unauthorized" }
  | { status: "configError"; message: string }
  /**
   * Fails open for tools/list filtering and the listener gate; real API calls
   * still authorize the credential before accessing workspace data.
   */
  | { status: "unavailable" }

const NEGATIVE_CACHE_TTL_MS = 30_000

type IntrospectionCacheEntry = {
  result: IntrospectionResult
  fetchedAtMs: number
  ttlMs: number
}

const introspectionCache = new Map<string, IntrospectionCacheEntry>()

/** Sweeps entries whose TTL has already elapsed so the cache can't grow unbounded across distinct token/workspace pairs. */
const evictExpiredEntries = (): void => {
  const nowMs = Date.now()
  for (const [key, entry] of introspectionCache) {
    if (nowMs - entry.fetchedAtMs >= entry.ttlMs) {
      introspectionCache.delete(key)
    }
  }
}

const cacheResult = (
  key: string,
  result: IntrospectionResult,
  ttlMs: number,
): IntrospectionResult => {
  evictExpiredEntries()
  introspectionCache.set(key, { result, fetchedAtMs: Date.now(), ttlMs })
  return result
}

/**
 * OAuth access tokens are JWTs. The builder verifies their signatures before
 * returning success; decoding here only bounds this cache entry so it cannot
 * outlive the already-verified `exp`. Opaque workspace API tokens retain the
 * configured cache TTL.
 */
const getPositiveCacheTtl = (token: string): number => {
  const payload = token.split(".")[1]
  if (!payload) {
    return env.CHATBOTX_SPEC_TTL_MS
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { exp?: unknown }
    if (typeof decoded.exp !== "number" || !Number.isFinite(decoded.exp)) {
      return env.CHATBOTX_SPEC_TTL_MS
    }

    return Math.max(
      0,
      Math.min(env.CHATBOTX_SPEC_TTL_MS, decoded.exp * 1000 - Date.now()),
    )
  } catch {
    return env.CHATBOTX_SPEC_TTL_MS
  }
}

export const introspectToken = async (
  token: string,
  workspaceId?: string,
): Promise<IntrospectionResult> => {
  const cacheKey = `${token}\u0000${workspaceId ?? ""}`
  const cached = introspectionCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAtMs < cached.ttlMs) {
    return cached.result
  }

  try {
    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    })
    if (workspaceId) {
      headers.set("x-workspace-id", workspaceId)
    }
    const response = await fetchWithTimeout(
      `${env.CHATBOTX_API_URL}/v1/token`,
      { headers },
      env.CHATBOTX_HTTP_TIMEOUT_MS,
    )
    if (response.status === 401) {
      return cacheResult(
        cacheKey,
        { status: "unauthorized" },
        NEGATIVE_CACHE_TTL_MS,
      )
    }
    if (response.status === 400) {
      const body = await response.text()
      let message = body || "Workspace selection is required"
      try {
        const parsed = JSON.parse(body) as {
          json?: { message?: unknown }
          message?: unknown
        }
        const envelopeMessage = parsed.json?.message ?? parsed.message
        if (typeof envelopeMessage === "string") {
          message = envelopeMessage
        }
      } catch {
        // Preserve a non-JSON error body verbatim for the MCP client.
      }
      return cacheResult(
        cacheKey,
        { status: "configError", message },
        NEGATIVE_CACHE_TTL_MS,
      )
    }
    if (!response.ok) {
      return cacheResult(
        cacheKey,
        { status: "unavailable" },
        NEGATIVE_CACHE_TTL_MS,
      )
    }
    const parsed = tokenIntrospectionSchema.safeParse(await response.json())
    if (!parsed.success) {
      logger.error(
        { err: parsed.error },
        "MCP token introspection returned a malformed response",
      )
      return cacheResult(
        cacheKey,
        { status: "unavailable" },
        NEGATIVE_CACHE_TTL_MS,
      )
    }
    return cacheResult(
      cacheKey,
      { status: "ok", data: parsed.data },
      getPositiveCacheTtl(token),
    )
  } catch (error) {
    logger.error({ err: error }, "MCP token introspection failed")
    return cacheResult(
      cacheKey,
      { status: "unavailable" },
      NEGATIVE_CACHE_TTL_MS,
    )
  }
}
