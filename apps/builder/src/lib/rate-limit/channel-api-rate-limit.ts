import { distributedStore } from "@chatbotx.io/redis"
import { logger } from "@/lib/log"

const WINDOW_SECONDS = 10
const REQUEST_LIMIT = 120
const memoryCounters = new Map<string, { count: number; expiresAt: number }>()

type RateLimitStore = Pick<
  typeof distributedStore,
  "incrementCounter" | "setNumberIfNotExists"
>

type ChannelApiRateLimitInput = {
  inboxId: string
  store?: RateLimitStore
  now?: number
}

type ChannelApiRateLimitResult = {
  limited: boolean
  retryAfter: number
}

const buildRateLimitKey = (inboxId: string, windowSuffix: string) =>
  ["channel-api-rate-limit", inboxId, windowSuffix].join(":")

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
 * Keyed on the inbox id, not the client IP — a per-inbox bearer token is
 * already the authenticated identity, so this sidesteps the `x-forwarded-for`
 * spoofing caveat that IP-keyed limiters carry entirely.
 */
export const checkChannelApiRateLimit = async ({
  inboxId,
  store = distributedStore,
  now = Date.now(),
}: ChannelApiRateLimitInput): Promise<ChannelApiRateLimitResult> => {
  const windowSuffix = buildWindowSuffix(now, WINDOW_SECONDS)
  const retryAfter = secondsUntilNextWindow(now, WINDOW_SECONDS)
  const key = buildRateLimitKey(inboxId, windowSuffix)

  try {
    const count = await incrementWindowCounter(store, key, WINDOW_SECONDS)
    return { limited: count > REQUEST_LIMIT, retryAfter }
  } catch (error) {
    logger.warn(
      { err: error, inboxId },
      "Channel API rate limit store failed, using local fallback",
    )
    const count = incrementMemoryWindowCounter(key, WINDOW_SECONDS)
    return { limited: count > REQUEST_LIMIT, retryAfter }
  }
}
