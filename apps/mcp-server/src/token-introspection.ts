import { z } from "zod"
import { env } from "./env"
import { fetchWithTimeout } from "./http"

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
      return cacheResult(
        cacheKey,
        {
          status: "configError",
          message: body || "Workspace selection is required",
        },
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
      return cacheResult(
        cacheKey,
        { status: "unavailable" },
        NEGATIVE_CACHE_TTL_MS,
      )
    }
    return cacheResult(
      cacheKey,
      { status: "ok", data: parsed.data },
      env.CHATBOTX_SPEC_TTL_MS,
    )
  } catch {
    return cacheResult(
      cacheKey,
      { status: "unavailable" },
      NEGATIVE_CACHE_TTL_MS,
    )
  }
}
