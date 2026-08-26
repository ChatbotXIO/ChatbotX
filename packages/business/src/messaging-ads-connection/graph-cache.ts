import {
  distributedLock,
  distributedStore,
  invalidateCacheByTags,
  invalidateCacheKeys,
  withCache,
} from "@chatbotx.io/redis"
import { logger } from "../logger"

/** Every cache entry for one connection scope (`channel:integrationId`) is tagged with this so a single invalidation call clears all of them, regardless of the exact resource key (e.g. the effective-status batch key varies with the exact sorted ad-id set requested). */
export const messagingAdsCacheTag = (scope: string): string => `msgads:${scope}`

// A per-key lock coalesces concurrent cold-miss fetches AND near-expiry
// background refreshes for the SAME cache key (v3 correction #7) — without
// it, N concurrent requests hitting an empty/stale cache entry would each
// fire their own Graph API call.
const REFRESH_LOCK_TIMEOUT_SECONDS = 20
// The generation counter only needs to outlive the longest-lived cache entry
// it guards — refreshed on every bump, so a quiet integration's counter
// simply expires (falls back to generation 0, safe: worst case is one extra
// unguarded refresh cycle, never a correctness issue).
const GENERATION_TTL_SECONDS = 30 * 24 * 60 * 60

type CacheEnvelope<T> = {
  value: T
  cachedAt: number
  generation: number
}

const generationKey = (scope: string): string => `msgads:gen:${scope}`

async function currentGeneration(scope: string): Promise<number> {
  return (await distributedStore.getNumber(generationKey(scope))) ?? 0
}

/**
 * Bumps the generation counter for a cache scope (`channel:integrationId`) —
 * call on connect/disconnect and after EVERY mutation (create/retry/publish/
 * pause/delete, v3 correction #8 — `retryDraft` included). A background
 * refresh already in flight re-checks this after its Graph call resolves and
 * discards (does not cache) a result computed against a now-stale
 * generation, so an in-flight refresh can never resurrect data superseded by
 * the invalidation that raced it.
 */
export async function bumpMessagingAdsCacheGeneration(
  scope: string,
): Promise<void> {
  const key = generationKey(scope)
  // Atomic increment (not read-modify-write): two concurrent mutations must
  // each advance the counter, or a refresh racing between them could observe
  // the same generation before and after its Graph call and cache
  // pre-mutation data (Codex impl-review). `incrementCounter` is a no-op when
  // the key is absent, so seed it first (NX — the loser of the seed race is a
  // no-op), then increment atomically.
  await distributedStore.setNumberIfNotExists(key, 0, GENERATION_TTL_SECONDS)
  await distributedStore.incrementCounter(key, 1, GENERATION_TTL_SECONDS)
}

/** Read-only peek: returns the cached envelope if present, `null` on a genuine miss — never computes (relies on `withCache` skipping the write for a `null`/`undefined` result). */
function peek<T>(key: string): Promise<CacheEnvelope<T> | null> {
  return withCache<CacheEnvelope<T> | null>(key, async () => null, {})
}

function lockedComputeAndStore<T>(input: {
  key: string
  scope: string
  ttlSeconds: number
  tags: string[]
  staleAfterSeconds: number
  fetch: () => Promise<T>
  /** Skips the freshness double-check below — an explicit force-refresh must always hit Graph, never short-circuit on a still-fresh peek. */
  skipFreshnessCheck?: boolean
}): Promise<CacheEnvelope<T>> {
  return distributedLock.runExclusive({
    key: `lock:${input.key}`,
    timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
    fn: async () => {
      const generationAtStart = await currentGeneration(input.scope)
      // Double-check now that we hold the lock: a sibling request may have
      // already refreshed this key while we were waiting (cold-miss/stale
      // coalescing only — a forced refresh always proceeds to fetch).
      const fresh = await peek<T>(input.key)
      if (
        !input.skipFreshnessCheck &&
        fresh &&
        fresh.generation >= generationAtStart &&
        Date.now() - fresh.cachedAt < input.staleAfterSeconds * 1000
      ) {
        return fresh
      }

      const value = await input.fetch()
      const generationAfterFetch = await currentGeneration(input.scope)
      const envelope: CacheEnvelope<T> = {
        value,
        cachedAt: Date.now(),
        generation: generationAfterFetch,
      }

      if (generationAfterFetch !== generationAtStart) {
        // An invalidation landed while the Graph call was in flight — this
        // result may reflect pre-mutation state. Still correct to hand back
        // to THIS caller, but must not be cached over a newer invalidation;
        // the next reader recomputes cleanly against the new generation.
        return envelope
      }

      await invalidateCacheKeys(input.key)
      await withCache(input.key, async () => envelope, {
        ttl: input.ttlSeconds,
        tags: input.tags,
      })
      return envelope
    },
  })
}

/**
 * Stale-while-revalidate read over a Graph resource: serves the cached value
 * immediately (even once past `staleAfterSeconds`) while kicking a
 * non-blocking, lock-coalesced background refresh; only blocks the caller on
 * a genuine cold miss or an explicit `forceRefresh`. The background refresh
 * NEVER throws into the request path (caught + logged here).
 */
export async function getOrRevalidate<T>(input: {
  key: string
  /** Cache-invalidation scope, e.g. `${channel}:${integrationId}` — shared by every resource key for one connection so a single bump guards all of them. */
  scope: string
  ttlSeconds: number
  staleAfterSeconds: number
  tags?: string[]
  fetch: () => Promise<T>
  forceRefresh?: boolean
}): Promise<T> {
  const tags = input.tags ?? []

  if (input.forceRefresh) {
    const envelope = await lockedComputeAndStore({
      ...input,
      tags,
      skipFreshnessCheck: true,
    })
    return envelope.value
  }

  const cached = await peek<T>(input.key)
  if (cached && Date.now() - cached.cachedAt < input.staleAfterSeconds * 1000) {
    return cached.value
  }

  if (!cached) {
    // Cold miss — the caller needs data now.
    const envelope = await lockedComputeAndStore({ ...input, tags })
    return envelope.value
  }

  // Stale but present: serve immediately, refresh in the background.
  lockedComputeAndStore({ ...input, tags }).catch((error) => {
    logger.error(
      { err: error, key: input.key },
      "Messaging ads cache background refresh failed",
    )
  })
  return cached.value
}

/**
 * Invalidates every cached Graph resource for one connection scope
 * (tag-based — the effective-status batch key varies with the exact sorted
 * ad-id set a given `list()` call requested, so exact keys aren't known at
 * invalidation time) and bumps the scope's generation so a refresh already
 * in flight discards its result instead of resurrecting stale data. Call on
 * connect/disconnect and after EVERY mutation (create/retry/publish/pause/
 * delete — v3 correction #8).
 */
export async function invalidateMessagingAdsCache(
  scope: string,
): Promise<void> {
  await Promise.all([
    bumpMessagingAdsCacheGeneration(scope),
    invalidateCacheByTags([messagingAdsCacheTag(scope)]),
  ])
}
