import { ChatbotXException } from "@chatbotx.io/business/errors"
import { distributedStore } from "@chatbotx.io/redis"
import { logger } from "@/lib/log"

const WINDOW_SECONDS = 10
const REQUEST_LIMIT = 120
const TOO_MANY_REQUESTS_STATUS = 429
const memoryCounters = new Map<string, { count: number; expiresAt: number }>()

type RateLimitStore = Pick<
  typeof distributedStore,
  "incrementCounter" | "setNumberIfNotExists"
>

type ApiRateLimitInput = {
  /** Rate-limit bucket name, e.g. "channel-api-rate-limit" or "workspace-token-rate-limit". */
  scope: string
  /** The authenticated identity being limited (inbox id, workspace id, ...). */
  key: string
  /**
   * Requests allowed per window. Defaults to the per-identity limit; pass a
   * higher ceiling for coarse pre-auth buckets (e.g. per-IP) that aggregate
   * many identities behind one key.
   */
  limit?: number
  store?: RateLimitStore
  now?: number
}

type ApiRateLimitResult = {
  limited: boolean
  retryAfter: number
}

const buildRateLimitKey = (scope: string, key: string, windowSuffix: string) =>
  [scope, key, windowSuffix].join(":")

// Fixed-window bucketing, same rationale as guest-rate-limit.ts: fold the
// window index into the key so a steady sender can't keep extending one
// key's TTL indefinitely.
const buildWindowSuffix = (now: number, windowSeconds: number) =>
  String(Math.floor(now / (windowSeconds * 1000)))

const secondsUntilNextWindow = (now: number, windowSeconds: number) => {
  const windowMs = windowSeconds * 1000
  const elapsed = now % windowMs
  return Math.ceil((windowMs - elapsed) / 1000)
}

const incrementMemoryWindowCounter = (key: string, windowSeconds: number) => {
  const now = Date.now()
  const current = memoryCounters.get(key)
  if (!current || current.expiresAt <= now) {
    memoryCounters.set(key, {
      count: 1,
      expiresAt: now + windowSeconds * 1000,
    })
    return 1
  }

  const next = current.count + 1
  memoryCounters.set(key, { ...current, count: next })
  return next
}

const incrementWindowCounter = async (
  store: RateLimitStore,
  key: string,
  windowSeconds: number,
) => {
  const created = await store.setNumberIfNotExists(key, 1, windowSeconds)
  if (created) {
    return 1
  }

  return (await store.incrementCounter(key, 1, windowSeconds)) ?? 1
}

/**
 * Keyed on the caller's authenticated identity (inbox id, workspace id, ...),
 * not the client IP — a per-token bearer credential is already that
 * identity, so this sidesteps the `x-forwarded-for` spoofing caveat that
 * IP-keyed limiters carry entirely.
 */
export const checkApiRateLimit = async ({
  scope,
  key: identityKey,
  limit = REQUEST_LIMIT,
  store = distributedStore,
  now = Date.now(),
}: ApiRateLimitInput): Promise<ApiRateLimitResult> => {
  const windowSuffix = buildWindowSuffix(now, WINDOW_SECONDS)
  const retryAfter = secondsUntilNextWindow(now, WINDOW_SECONDS)
  const key = buildRateLimitKey(scope, identityKey, windowSuffix)

  try {
    const count = await incrementWindowCounter(store, key, WINDOW_SECONDS)
    return { limited: count > limit, retryAfter }
  } catch (error) {
    logger.warn(
      { err: error, scope, key: identityKey },
      "API rate limit store failed, using local fallback",
    )
    const count = incrementMemoryWindowCounter(key, WINDOW_SECONDS)
    return { limited: count > limit, retryAfter }
  }
}

/**
 * Throwing wrapper around `checkApiRateLimit` shared by every bearer-token
 * API surface (channel API, workspace token API) so the 429 shape can never
 * drift between them.
 */
export const assertApiNotRateLimited = async (
  props: ApiRateLimitInput,
): Promise<void> => {
  const { limited, retryAfter } = await checkApiRateLimit(props)
  if (limited) {
    throw new ChatbotXException(
      `Too many requests. Retry after ${retryAfter}s.`,
      "tooManyRequests",
      TOO_MANY_REQUESTS_STATUS,
    )
  }
}
