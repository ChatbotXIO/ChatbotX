import { z } from "zod"
import { env } from "./env"

const tokenIntrospectionSchema = z.object({
  workspaceId: z.string(),
  permission: z.enum(["read_only", "full"]),
  scopes: z.array(z.string()).nullable(),
})

export type TokenIntrospection = z.infer<typeof tokenIntrospectionSchema>

/**
 * Cached by the raw token *value*, never by session — a session's token can
 * change mid-connection (see `sse-server.ts`'s per-request resolver), so
 * caching by session id would serve a stale/wrong scope set after a token
 * swap. Module-level, same pattern as `openapi-loader.ts`'s tool cache.
 */
const introspectionCache = new Map<
  string,
  { data: TokenIntrospection; fetchedAtMs: number }
>()

/** Sweeps entries whose TTL has already elapsed so the cache can't grow unbounded across distinct tokens. */
function evictExpiredEntries(): void {
  const cutoffMs = Date.now() - env.CHATBOTX_SPEC_TTL_MS
  for (const [apiKey, entry] of introspectionCache) {
    if (entry.fetchedAtMs < cutoffMs) {
      introspectionCache.delete(apiKey)
    }
  }
}

/**
 * Resolves a workspace token's scopes/permission via `GET /v1/token`, for
 * scope-based `tools/list` filtering. Returns `null` on any failure
 * (network error, non-2xx, malformed body) — callers must fail OPEN (skip
 * scope filtering, not hide every tool) on `null`: enforcement of scope
 * still happens server-side on the actual call; this is a `tools/list`
 * display concern only.
 */
export async function introspectToken(
  apiKey: string,
): Promise<TokenIntrospection | null> {
  const cached = introspectionCache.get(apiKey)
  if (cached && Date.now() - cached.fetchedAtMs < env.CHATBOTX_SPEC_TTL_MS) {
    return cached.data
  }

  try {
    const response = await fetch(`${env.CHATBOTX_API_URL}/v1/token`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    })
    if (!response.ok) {
      return null
    }
    const parsed = tokenIntrospectionSchema.safeParse(await response.json())
    if (!parsed.success) {
      console.error(
        `Token introspection returned a malformed body, tools/list will not be scope-filtered: ${parsed.error.message}`,
      )
      return null
    }
    evictExpiredEntries()
    introspectionCache.set(apiKey, {
      data: parsed.data,
      fetchedAtMs: Date.now(),
    })
    return parsed.data
  } catch (error) {
    console.error(
      `Token introspection failed, tools/list will not be scope-filtered: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return null
  }
}
