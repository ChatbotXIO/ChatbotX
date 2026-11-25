import { createHash } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"
import { resolveHeaderValue } from "../http-headers"
import { isExpiredJwt } from "../jwt-claims"
import { writeJsonRpcError } from "./http-utils"

const ONE_MINUTE_MS = 60_000
// Bounds memory under a flood of one-off keys (random tokens, spoofed IPs)
// that all land inside one window, before the expiry sweep can drop them.
const DEFAULT_MAX_KEYS = 50_000
const UNKNOWN_CLIENT_IP = "unknown"

type RateLimitDecision =
  | { limited: false }
  | { limited: true; retryAfterSeconds: number }

type WindowCounter = { count: number; windowStartMs: number }

type FixedWindowLimiterOptions = {
  /** Hits allowed per key per window; 0 or less disables the limiter. */
  limit: number
  windowMs: number
  maxKeys?: number
}

type FixedWindowLimiter = {
  /** Counts one hit against `key` and reports whether it is over the limit. */
  hit: (key: string, nowMs?: number) => RateLimitDecision
  /** Reports whether `key` is already over the limit, without counting. */
  peek: (key: string, nowMs?: number) => RateLimitDecision
  /** Number of keys currently tracked. */
  size: () => number
}

const NOT_LIMITED: RateLimitDecision = { limited: false }

/**
 * In-process fixed-window counter. Each mcp-server process keeps its own
 * counts: MCP sessions already live in process memory, so a client stays on
 * one process for a session and the per-process limit is the effective one.
 */
export const createFixedWindowLimiter = ({
  limit,
  windowMs,
  maxKeys = DEFAULT_MAX_KEYS,
}: FixedWindowLimiterOptions): FixedWindowLimiter => {
  const counters = new Map<string, WindowCounter>()
  let nextSweepAtMs = 0

  const isCurrent = (counter: WindowCounter, nowMs: number): boolean =>
    nowMs - counter.windowStartMs < windowMs

  const sweepExpired = (nowMs: number): void => {
    if (nowMs < nextSweepAtMs) {
      return
    }
    nextSweepAtMs = nowMs + windowMs
    for (const [key, counter] of counters) {
      if (!isCurrent(counter, nowMs)) {
        counters.delete(key)
      }
    }
  }

  const decide = (counter: WindowCounter, nowMs: number): RateLimitDecision =>
    counter.count > limit
      ? {
          limited: true,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((counter.windowStartMs + windowMs - nowMs) / 1000),
          ),
        }
      : NOT_LIMITED

  const currentCounter = (
    key: string,
    nowMs: number,
  ): WindowCounter | undefined => {
    const counter = counters.get(key)
    return counter && isCurrent(counter, nowMs) ? counter : undefined
  }

  const evictOldestIfFull = (): void => {
    if (counters.size < maxKeys) {
      return
    }
    const oldestKey = counters.keys().next().value
    if (oldestKey !== undefined) {
      counters.delete(oldestKey)
    }
  }

  return {
    hit: (key, nowMs = Date.now()) => {
      if (limit <= 0) {
        return NOT_LIMITED
      }
      sweepExpired(nowMs)
      const current = currentCounter(key, nowMs)
      if (current) {
        const next = { ...current, count: current.count + 1 }
        // Re-inserting moves the key to the end, so eviction drops the
        // least recently hit key, not a busy one.
        counters.delete(key)
        counters.set(key, next)
        return decide(next, nowMs)
      }
      counters.delete(key)
      evictOldestIfFull()
      const fresh = { count: 1, windowStartMs: nowMs }
      counters.set(key, fresh)
      return decide(fresh, nowMs)
    },
    peek: (key, nowMs = Date.now()) => {
      if (limit <= 0) {
        return NOT_LIMITED
      }
      const current = currentCounter(key, nowMs)
      // A peek asks "would this request be refused", so it compares the
      // count already reached, not the count after one more hit.
      return current && current.count >= limit
        ? decide({ ...current, count: current.count + 1 }, nowMs)
        : NOT_LIMITED
    },
    size: () => counters.size,
  }
}

/**
 * The caller's address. Each proxy in front appends the address it saw to
 * `X-Forwarded-For`, so with `trustedProxyHops` proxies the client is that
 * many entries from the right; anything further left was sent by the client
 * and is ignored. With no trusted proxy, only the socket address counts.
 */
export const clientIpOf = (
  req: IncomingMessage,
  trustedProxyHops: number,
): string => {
  const socketAddress = req.socket?.remoteAddress || UNKNOWN_CLIENT_IP
  if (trustedProxyHops <= 0) {
    return socketAddress
  }
  const hops = resolveHeaderValue(req.headers["x-forwarded-for"])
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean)
  if (hops.length === 0) {
    return socketAddress
  }
  return hops[Math.max(0, hops.length - trustedProxyHops)] ?? socketAddress
}

const hashCredential = (credential: string): string =>
  createHash("sha256").update(credential).digest("base64url")

type McpRateLimitGuardOptions = {
  /** The credential a request presents, whichever way it is sent. */
  credentialOf: (req: IncomingMessage) => string | undefined
  /** Requests per minute per credential; 0 disables. */
  requestsPerMinute: number
  /** Rejected credentials per minute per IP before it is refused; 0 disables. */
  authFailuresPerMinute: number
  /** Proxies in front whose `X-Forwarded-For` entries are trusted. */
  trustedProxyHops: number
}

type McpRateLimitGuard = {
  /** Writes a 429 and returns false when the request must be refused. */
  admit: (req: IncomingMessage, res: ServerResponse) => boolean
  /** Records a rejected credential once the request has been answered. */
  recordOutcome: (req: IncomingMessage, res: ServerResponse) => void
}

const writeTooManyRequests = (
  res: ServerResponse,
  retryAfterSeconds: number,
): void => {
  res.setHeader("Retry-After", String(retryAfterSeconds))
  writeJsonRpcError(
    res,
    429,
    `Too many requests. Retry after ${retryAfterSeconds} seconds.`,
  )
}

/**
 * Two limits on every MCP route:
 * - requests per credential (hashed, never stored raw), so one token cannot
 *   monopolise the server. A request without a credential is not counted:
 *   it is answered with a cheap 401 (or, with OAuth off, uses the server's
 *   own key), and keying it by IP would put every client behind one proxy
 *   or shared egress (Claude, ChatGPT) into a single bucket;
 * - rejected credentials per client IP, so token guessing is cut off before
 *   each guess costs an introspection call. An expired JWT is not counted:
 *   it is the normal refresh path, and it is rejected without introspection.
 *   This limit is only as sound as the client IP, so it needs
 *   `trustedProxyHops` to match the proxies in front of the server.
 */
export const createMcpRateLimitGuard = ({
  credentialOf,
  requestsPerMinute,
  authFailuresPerMinute,
  trustedProxyHops,
}: McpRateLimitGuardOptions): McpRateLimitGuard => {
  const requests = createFixedWindowLimiter({
    limit: requestsPerMinute,
    windowMs: ONE_MINUTE_MS,
  })
  const authFailures = createFixedWindowLimiter({
    limit: authFailuresPerMinute,
    windowMs: ONE_MINUTE_MS,
  })
  const ipOf = (req: IncomingMessage) => clientIpOf(req, trustedProxyHops)

  return {
    admit: (req, res) => {
      const failureDecision = authFailures.peek(ipOf(req))
      if (failureDecision.limited) {
        writeTooManyRequests(res, failureDecision.retryAfterSeconds)
        return false
      }
      const credential = credentialOf(req)
      if (!credential) {
        return true
      }
      const requestDecision = requests.hit(
        `credential:${hashCredential(credential)}`,
      )
      if (requestDecision.limited) {
        writeTooManyRequests(res, requestDecision.retryAfterSeconds)
        return false
      }
      return true
    },
    recordOutcome: (req, res) => {
      if (res.statusCode !== 401) {
        return
      }
      const credential = credentialOf(req)
      if (credential && !isExpiredJwt(credential)) {
        authFailures.hit(ipOf(req))
      }
    },
  }
}
