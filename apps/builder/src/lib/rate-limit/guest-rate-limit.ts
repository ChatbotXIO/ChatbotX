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
}

type GuestRateLimitResult = {
  limited: boolean
  retryAfter: number
}

const buildRateLimitKey = (...parts: string[]) =>
  ["guest-rate-limit", ...parts].join(":")

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
}: GuestRateLimitInput): Promise<GuestRateLimitResult> => {
  const ipKey = buildRateLimitKey("ip", webchatId, clientIp)
  const sessionKey = guestConversationId
    ? buildRateLimitKey("session", webchatId, guestConversationId)
    : null

  try {
    const ipCount = await incrementWindowCounter(store, ipKey, WINDOW_SECONDS)
    if (ipCount > IP_LIMIT) {
      return { limited: true, retryAfter: WINDOW_SECONDS }
    }

    if (sessionKey) {
      const sessionCount = await incrementWindowCounter(
        store,
        sessionKey,
        WINDOW_SECONDS,
      )
      if (sessionCount > SESSION_LIMIT) {
        return { limited: true, retryAfter: WINDOW_SECONDS }
      }
    }

    return { limited: false, retryAfter: WINDOW_SECONDS }
  } catch (error) {
    logger.warn(
      { err: error, webchatId, clientIp },
      "Guest rate limit store failed, using local fallback",
    )
    const ipCount = incrementMemoryWindowCounter(ipKey, WINDOW_SECONDS)
    if (ipCount > IP_LIMIT) {
      return { limited: true, retryAfter: WINDOW_SECONDS }
    }

    if (sessionKey) {
      const sessionCount = incrementMemoryWindowCounter(
        sessionKey,
        WINDOW_SECONDS,
      )
      if (sessionCount > SESSION_LIMIT) {
        return { limited: true, retryAfter: WINDOW_SECONDS }
      }
    }

    return { limited: false, retryAfter: WINDOW_SECONDS }
  }
}

export const getGuestClientIp = (headers: Headers) => {
  const forwardedFor = headers.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown"
  }

  return headers.get("x-real-ip")?.trim() || "unknown"
}
