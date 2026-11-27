import type { IncomingMessage, ServerResponse } from "node:http"
import { describe, expect, test } from "vitest"
import {
  clientIpOf,
  createFixedWindowLimiter,
  createMcpRateLimitGuard,
} from "../src/server/rate-limit"

const WINDOW_MS = 60_000

describe("createFixedWindowLimiter", () => {
  test("admits hits up to the limit, then limits the rest of the window", () => {
    const limiter = createFixedWindowLimiter({ limit: 2, windowMs: WINDOW_MS })

    expect(limiter.hit("a", 0).limited).toBe(false)
    expect(limiter.hit("a", 1).limited).toBe(false)
    expect(limiter.hit("a", 2)).toEqual({
      limited: true,
      retryAfterSeconds: 60,
    })
  })

  test("reports the seconds left in the window as retryAfterSeconds", () => {
    const limiter = createFixedWindowLimiter({ limit: 1, windowMs: WINDOW_MS })

    limiter.hit("a", 0)

    expect(limiter.hit("a", 45_500)).toEqual({
      limited: true,
      retryAfterSeconds: 15,
    })
  })

  test("starts a fresh count once the window has passed", () => {
    const limiter = createFixedWindowLimiter({ limit: 1, windowMs: WINDOW_MS })

    limiter.hit("a", 0)
    expect(limiter.hit("a", 10).limited).toBe(true)

    expect(limiter.hit("a", WINDOW_MS).limited).toBe(false)
  })

  test("counts each key separately", () => {
    const limiter = createFixedWindowLimiter({ limit: 1, windowMs: WINDOW_MS })

    limiter.hit("a", 0)

    expect(limiter.hit("b", 0).limited).toBe(false)
    expect(limiter.hit("a", 0).limited).toBe(true)
  })

  test("peek reports the state without counting a hit", () => {
    const limiter = createFixedWindowLimiter({ limit: 1, windowMs: WINDOW_MS })

    expect(limiter.peek("a", 0).limited).toBe(false)
    expect(limiter.peek("a", 0).limited).toBe(false)
    limiter.hit("a", 0)

    expect(limiter.peek("a", 1)).toEqual({
      limited: true,
      retryAfterSeconds: 60,
    })
  })

  test("a limit of 0 disables the limiter", () => {
    const limiter = createFixedWindowLimiter({ limit: 0, windowMs: WINDOW_MS })

    for (let index = 0; index < 1000; index += 1) {
      expect(limiter.hit("a", index).limited).toBe(false)
    }
    expect(limiter.size()).toBe(0)
  })

  test("drops expired keys so a flood of one-off keys cannot grow it forever", () => {
    const limiter = createFixedWindowLimiter({ limit: 5, windowMs: WINDOW_MS })

    for (let index = 0; index < 100; index += 1) {
      limiter.hit(`key-${index}`, 0)
    }
    expect(limiter.size()).toBe(100)

    limiter.hit("late", WINDOW_MS + 1)

    expect(limiter.size()).toBe(1)
  })

  test("evicts the oldest key once maxKeys is reached", () => {
    const limiter = createFixedWindowLimiter({
      limit: 1,
      maxKeys: 2,
      windowMs: WINDOW_MS,
    })

    limiter.hit("a", 0)
    limiter.hit("b", 0)
    limiter.hit("c", 0)

    expect(limiter.size()).toBe(2)
    expect(limiter.peek("a", 0).limited).toBe(false)
    expect(limiter.peek("c", 0).limited).toBe(true)
  })

  test("a key that keeps being hit is not the one evicted", () => {
    const limiter = createFixedWindowLimiter({
      limit: 1,
      maxKeys: 2,
      windowMs: WINDOW_MS,
    })

    limiter.hit("hot", 0)
    limiter.hit("cold", 0)
    limiter.hit("hot", 1)
    limiter.hit("new", 2)

    expect(limiter.peek("hot", 3).limited).toBe(true)
    expect(limiter.peek("cold", 3).limited).toBe(false)
  })
})

const fakeRequest = (
  headers: Record<string, string>,
  remoteAddress?: string,
): IncomingMessage =>
  ({ headers, socket: { remoteAddress } }) as unknown as IncomingMessage

describe("clientIpOf", () => {
  test("ignores X-Forwarded-For when no proxy is trusted", () => {
    expect(
      clientIpOf(
        fakeRequest({ "x-forwarded-for": "203.0.113.7" }, "10.0.0.2"),
        0,
      ),
    ).toBe("10.0.0.2")
  })

  test("takes the hop the trusted proxy appended, not a client-sent one", () => {
    const request = fakeRequest(
      { "x-forwarded-for": "198.51.100.66, 203.0.113.7" },
      "10.0.0.2",
    )

    expect(clientIpOf(request, 1)).toBe("203.0.113.7")
    expect(clientIpOf(request, 2)).toBe("198.51.100.66")
  })

  test("falls back to the socket without X-Forwarded-For", () => {
    expect(clientIpOf(fakeRequest({}, "198.51.100.1"), 1)).toBe("198.51.100.1")
  })

  test("returns 'unknown' when nothing identifies the caller", () => {
    expect(clientIpOf(fakeRequest({}), 0)).toBe("unknown")
  })
})

type FakeResponse = ServerResponse & { headers: Record<string, string> }

const fakeResponse = (statusCode = 200): FakeResponse => {
  const headers: Record<string, string> = {}
  return {
    end: () => undefined,
    headers,
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = value
    },
    statusCode,
  } as unknown as FakeResponse
}

const jwtExpiringAt = (expSeconds: number) =>
  `h.${Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url")}.s`

describe("createMcpRateLimitGuard", () => {
  const guardFor = (options: {
    requestsPerMinute?: number
    authFailuresPerMinute?: number
  }) =>
    createMcpRateLimitGuard({
      authFailuresPerMinute: options.authFailuresPerMinute ?? 0,
      credentialOf: (req) =>
        (req.headers.authorization as string | undefined)?.slice(7),
      requestsPerMinute: options.requestsPerMinute ?? 0,
      trustedProxyHops: 0,
    })
  const withToken = (token: string) =>
    fakeRequest({ authorization: `Bearer ${token}` }, "203.0.113.1")

  test("answers 429 with Retry-After once a credential is over its limit", () => {
    const guard = guardFor({ requestsPerMinute: 1 })

    expect(guard.admit(withToken("a"), fakeResponse())).toBe(true)
    const response = fakeResponse()
    expect(guard.admit(withToken("a"), response)).toBe(false)
    expect(response.statusCode).toBe(429)
    expect(Number(response.headers["retry-after"])).toBeGreaterThan(0)
  })

  test("does not limit requests without a credential", () => {
    const guard = guardFor({ requestsPerMinute: 1 })

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(guard.admit(fakeRequest({}, "203.0.113.1"), fakeResponse())).toBe(
        true,
      )
    }
  })

  test("refuses an IP after too many rejected credentials", () => {
    const guard = guardFor({ authFailuresPerMinute: 2 })

    for (const token of ["guess-1", "guess-2"]) {
      const request = withToken(token)
      expect(guard.admit(request, fakeResponse())).toBe(true)
      guard.recordOutcome(request, fakeResponse(401))
    }

    expect(guard.admit(withToken("guess-3"), fakeResponse())).toBe(false)
  })

  test("does not count an expired JWT, the normal refresh path", () => {
    const guard = guardFor({ authFailuresPerMinute: 1 })
    const expired = withToken(jwtExpiringAt(1))

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(guard.admit(expired, fakeResponse())).toBe(true)
      guard.recordOutcome(expired, fakeResponse(401))
    }
  })
})
