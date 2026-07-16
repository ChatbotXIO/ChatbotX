import { distributedStore } from "@chatbotx.io/redis"
import { logger } from "@/lib/log"

const WINDOW_SECONDS = 10
const IP_LIMIT = 60
const SESSION_LIMIT = 20
const memoryCounters = new Map<string, { count: number; expiresAt: number }>()

type RateLimitStore = Pick<
  typeof distributedStore,
  "incrementCounter" | "setNumberIfNotExists"
>

type GuestRateLimitInput = {
  webchatId: string
  clientIp: string
  guestConversationId?: string | null
  store?: RateLimitStore
  now?: number
}

type GuestRateLimitResult = {
  limited: boolean
  retryAfter: number
}

const buildRateLimitKey = (...parts: string[]) =>
  ["guest-rate-limit", ...parts].join(":")

// Fixed-window bucketing: fold the current window index into the key itself
// instead of relying on `incrementCounter`'s per-hit TTL refresh (which would
// produce a sliding window that a steady sender could keep alive
// indefinitely). Each window gets its own key that naturally expires once —
// no key ever has its TTL extended past one window's worth of time.
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

export const checkGuestRateLimit = async ({
  webchatId,
  clientIp,
  guestConversationId,
  store = distributedStore,
  now = Date.now(),
}: GuestRateLimitInput): Promise<GuestRateLimitResult> => {
  const windowSuffix = buildWindowSuffix(now, WINDOW_SECONDS)
  const retryAfter = secondsUntilNextWindow(now, WINDOW_SECONDS)
  const ipKey = buildRateLimitKey("ip", webchatId, clientIp, windowSuffix)
  const sessionKey = guestConversationId
    ? buildRateLimitKey("session", webchatId, guestConversationId, windowSuffix)
    : null

  try {
    const ipCount = await incrementWindowCounter(store, ipKey, WINDOW_SECONDS)
    if (ipCount > IP_LIMIT) {
      return { limited: true, retryAfter }
    }

    if (sessionKey) {
      const sessionCount = await incrementWindowCounter(
        store,
        sessionKey,
        WINDOW_SECONDS,
      )
      if (sessionCount > SESSION_LIMIT) {
        return { limited: true, retryAfter }
      }
    }

    return { limited: false, retryAfter }
  } catch (error) {
    logger.warn(
      { err: error, webchatId, clientIp },
      "Guest rate limit store failed, using local fallback",
    )
    const ipCount = incrementMemoryWindowCounter(ipKey, WINDOW_SECONDS)
    if (ipCount > IP_LIMIT) {
      return { limited: true, retryAfter }
    }

    if (sessionKey) {
      const sessionCount = incrementMemoryWindowCounter(
        sessionKey,
        WINDOW_SECONDS,
      )
      if (sessionCount > SESSION_LIMIT) {
        return { limited: true, retryAfter }
      }
    }

    return { limited: false, retryAfter }
  }
}

// Trusts the first `x-forwarded-for` hop as the client IP. This is only
// correct behind a proxy that overwrites (not appends to) the header before
// forwarding — otherwise a caller can set an arbitrary `X-Forwarded-For` to
// rotate their rate-limit key (evasion) or pin a victim's IP (lockout).
// Confirm the deployment's ingress/proxy strips inbound XFF before trusting
// this for anything beyond best-effort abuse mitigation.
export const getGuestClientIp = (headers: Headers) => {
  const forwardedFor = headers.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown"
  }

  return headers.get("x-real-ip")?.trim() || "unknown"
}
