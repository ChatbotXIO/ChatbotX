import { distributedStore } from "@chatbotx.io/redis"
import { logger } from "@/lib/log"

// Same fixed-window bucketing as `guest-rate-limit.ts`/`channel-api-rate-limit.ts`:
// the window index is folded into the key so a steady sender can't keep one
// key's TTL alive indefinitely.
const WINDOW_SECONDS = 10
const REQUEST_LIMIT = 60
const memoryCounters = new Map<string, { count: number; expiresAt: number }>()

type RateLimitStore = Pick<
  typeof distributedStore,
  "incrementCounter" | "setNumberIfNotExists"
>

type FreeswitchXmlRateLimitInput = {
  clientIp: string
  store?: RateLimitStore
  now?: number
}

type FreeswitchXmlRateLimitResult = {
  limited: boolean
  retryAfter: number
}

const buildRateLimitKey = (clientIp: string, windowSuffix: string) =>
  ["freeswitch-xml-rate-limit", clientIp, windowSuffix].join(":")

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
 * Keyed on client IP — applied only to requests whose source is NOT in
 * `FS_XML_ALLOWED_IPS`: the responder's rate limit applies to
 * non-allowlisted sources only, so a burst from FreeSWITCH is never
 * throttled.
 */
export const checkFreeswitchXmlRateLimit = async ({
  clientIp,
  store = distributedStore,
  now = Date.now(),
}: FreeswitchXmlRateLimitInput): Promise<FreeswitchXmlRateLimitResult> => {
  const windowSuffix = buildWindowSuffix(now, WINDOW_SECONDS)
  const retryAfter = secondsUntilNextWindow(now, WINDOW_SECONDS)
  const key = buildRateLimitKey(clientIp, windowSuffix)

  try {
    const count = await incrementWindowCounter(store, key, WINDOW_SECONDS)
    return { limited: count > REQUEST_LIMIT, retryAfter }
  } catch (error) {
    logger.warn(
      { err: error, clientIp },
      "FreeSWITCH xml_curl rate limit store failed, using local fallback",
    )
    const count = incrementMemoryWindowCounter(key, WINDOW_SECONDS)
    return { limited: count > REQUEST_LIMIT, retryAfter }
  }
}

// --- Trusted-proxy-aware client IP resolution ---
//
// `X-Forwarded-For` is a client-supplied header: the LEFT-most hop is
// whatever the original caller wrote into it, so trusting it directly lets
// anyone bypass `FS_XML_ALLOWED_IPS` by sending a fake header. The only hop
// that can be trusted is the one written by OUR reverse proxy — which
// appends to the right of the chain — and only once we know which
// addresses in the chain are actually our proxies (`FS_XML_TRUSTED_PROXY_CIDRS`).
// Basic auth (`FS_XML_BASIC_USER`/`PASS`) is the real gate; the IP allowlist
// is defence-in-depth on top of it (see `route.ts`).

type IpVersion4 = { version: 4; bytes: [number, number, number, number] }
type ParsedIp = IpVersion4 | { version: 6; bytes: number[] } | null

const parseIpv4 = (value: string): IpVersion4 | null => {
  const parts = value.split(".")
  if (parts.length !== 4) {
    return null
  }
  const bytes = parts.map((part) => Number(part))
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    return null
  }
  return { version: 4, bytes: bytes as [number, number, number, number] }
}

/** Minimal parser: enough for the common `::ffff:a.b.c.d`-free IPv6 CIDR case. */
const parseIpv6 = (value: string): { version: 6; bytes: number[] } | null => {
  if (!value.includes(":")) {
    return null
  }
  const [head, tail] = value.split("::")
  const headParts = head ? head.split(":") : []
  const tailParts = tail ? tail.split(":") : []
  const missing = 8 - headParts.length - tailParts.length
  if (value.includes("::") ? missing < 0 : missing !== 0) {
    return null
  }
  const groups = value.includes("::")
    ? [
        ...headParts,
        ...Array.from({ length: missing }, () => "0"),
        ...tailParts,
      ]
    : headParts
  if (groups.length !== 8) {
    return null
  }
  const bytes: number[] = []
  for (const group of groups) {
    const n = Number.parseInt(group || "0", 16)
    if (!Number.isInteger(n) || n < 0 || n > 0xff_ff) {
      return null
    }
    // Split the 16-bit group into two bytes without bitwise operators
    // (repo lint forbids them): arithmetic floor-div/mod is equivalent to
    // `>> 8` / `& 0xff` for a value already known to be in [0, 0xffff].
    bytes.push(Math.floor(n / 256), n % 256)
  }
  return { version: 6, bytes }
}

const parseIp = (value: string): ParsedIp =>
  parseIpv4(value) ?? parseIpv6(value)

/**
 * True when the top `bitCount` bits of `a` and `b` (each a byte, 0-255)
 * are equal — an arithmetic (no bitwise operators) equivalent of
 * `(a & mask) === (b & mask)` for `mask = 0xff << (8 - bitCount)`.
 */
const topBitsEqual = (a: number, b: number, bitCount: number): boolean => {
  const divisor = 2 ** (8 - bitCount)
  return Math.floor(a / divisor) === Math.floor(b / divisor)
}

const isInCidr = (ip: string, cidr: string): boolean => {
  const [rangeAddress, prefixRaw] = cidr.split("/")
  const parsedIp = parseIp(ip)
  const parsedRange = rangeAddress ? parseIp(rangeAddress) : null
  if (!(parsedIp && parsedRange) || parsedIp.version !== parsedRange.version) {
    return false
  }
  const totalBits = parsedIp.version === 4 ? 32 : 128
  const prefixLength = prefixRaw ? Number(prefixRaw) : totalBits
  if (
    !Number.isInteger(prefixLength) ||
    prefixLength < 0 ||
    prefixLength > totalBits
  ) {
    return false
  }

  let remainingBits = prefixLength
  for (let i = 0; i < parsedIp.bytes.length && remainingBits > 0; i++) {
    const bitsInThisByte = Math.min(8, remainingBits)
    if (
      !topBitsEqual(parsedIp.bytes[i], parsedRange.bytes[i], bitsInThisByte)
    ) {
      return false
    }
    remainingBits -= bitsInThisByte
  }
  return true
}

const isTrustedProxy = (ip: string, trustedCidrs: readonly string[]): boolean =>
  trustedCidrs.some((cidr) => isInCidr(ip, cidr))

/**
 * True when `ip` matches any entry in `allowlist` — each entry may be a
 * bare IP (exact match) or a CIDR range (e.g. `31.13.0.0/16`).
 */
export const isIpAllowlisted = (
  ip: string,
  allowlist: readonly string[],
): boolean => allowlist.some((entry) => isInCidr(ip, entry))

let hasWarnedNoTrustedProxyConfig = false

/**
 * Resolves the request's real client IP for the allowlist check — but ONLY
 * when `trustedProxyCidrs` is configured. Peels `X-Forwarded-For` hops from
 * the RIGHT (closest to us), skipping every hop inside a trusted CIDR, and
 * returns the first hop that is NOT trusted (the actual peer that talked to
 * our trusted edge). Without a trusted-proxy config there is no way to tell
 * a real hop from a forged one, so this returns `null` — the caller must
 * then skip the IP allowlist rather than trust a spoofable value, and this
 * logs a one-time startup warning that the allowlist is inactive.
 */
export const getFreeswitchClientIp = (
  headers: Headers,
  trustedProxyCidrs: readonly string[] = [],
): string | null => {
  if (trustedProxyCidrs.length === 0) {
    if (!hasWarnedNoTrustedProxyConfig) {
      hasWarnedNoTrustedProxyConfig = true
      logger.warn(
        "FS_XML_TRUSTED_PROXY_CIDRS is not configured — the FreeSWITCH xml_curl IP allowlist is INACTIVE (Basic auth is still enforced). Set FS_XML_TRUSTED_PROXY_CIDRS to the reverse proxy's CIDR(s) to activate it.",
      )
    }
    return null
  }

  const forwardedFor = headers.get("x-forwarded-for")
  const hops = forwardedFor
    ? forwardedFor
        .split(",")
        .map((hop) => hop.trim())
        .filter(Boolean)
    : []

  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i]
    if (hop && !isTrustedProxy(hop, trustedProxyCidrs)) {
      return hop
    }
  }

  const realIp = headers.get("x-real-ip")?.trim()
  if (realIp && !isTrustedProxy(realIp, trustedProxyCidrs)) {
    return realIp
  }

  return null
}
