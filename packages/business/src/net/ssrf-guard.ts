const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain"])

const DOH_ENDPOINT = "https://1.1.1.1/dns-query"
const DOH_TIMEOUT_MS = 3000
const DNS_RECORD_TYPE_A = 1
const DNS_RECORD_TYPE_AAAA = 28

const BLOCKED_IPV4_RANGES: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]

const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/

const isIpv4Literal = (value: string): boolean => IPV4_PATTERN.test(value)

const isIpv6Literal = (value: string): boolean => {
  if (!value.includes(":")) {
    return false
  }
  try {
    // The URL/Web API host parser normalizes and validates IPv6 literals.
    new URL(`http://[${value.replace(/^\[|\]$/g, "")}]`)
    return true
  } catch {
    return false
  }
}

const ipv4ToInt = (ip: string): number =>
  ip
    .split(".")
    .reduce((acc, octet) => acc * 256 + Number.parseInt(octet, 10), 0)

const isIpv4InRange = (ip: string, range: string, prefixLength: number) => {
  const hostBits = 32 - prefixLength
  const blockSize = 2 ** hostBits
  const networkStart = Math.floor(ipv4ToInt(range) / blockSize) * blockSize
  const networkEnd = networkStart + blockSize
  const ipValue = ipv4ToInt(ip)
  return ipValue >= networkStart && ipValue < networkEnd
}

const isBlockedIpv4 = (ip: string): boolean =>
  BLOCKED_IPV4_RANGES.some(([range, prefixLength]) =>
    isIpv4InRange(ip, range, prefixLength),
  )

// IPv4-mapped IPv6 (::ffff:0:0/96) and NAT64 (64:ff9b::/96) embed an IPv4
// address in the last 32 bits. Node's URL parser always canonicalizes these
// to pure hex groups (e.g. "::ffff:127.0.0.1" -> "::ffff:7f00:1"), so string
// literals like "::ffff:169.254.169.254" never actually match anything;
// extract the embedded IPv4 and re-check it against the same IPv4 blocklist.
const extractEmbeddedIpv4 = (normalized: string): string | null => {
  const groups = normalized.split(":")
  const last = groups.at(-1)
  const secondLast = groups.at(-2)
  if (!(last && secondLast) || last.length > 4 || secondLast.length > 4) {
    return null
  }
  const highBits = Number.parseInt(secondLast || "0", 16)
  const lowBits = Number.parseInt(last, 16)
  if (Number.isNaN(highBits) || Number.isNaN(lowBits)) {
    return null
  }
  return [
    Math.floor(highBits / 256) % 256,
    highBits % 256,
    Math.floor(lowBits / 256) % 256,
    lowBits % 256,
  ].join(".")
}

const isBlockedIpv6 = (ip: string): boolean => {
  const normalized = ip.toLowerCase()
  if (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  ) {
    return true
  }

  if (
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("0:0:0:0:0:ffff:") ||
    normalized.startsWith("64:ff9b::")
  ) {
    const embeddedIpv4 = extractEmbeddedIpv4(normalized)
    return embeddedIpv4 === null || isBlockedIpv4(embeddedIpv4)
  }

  return false
}

const isBlockedIp = (ip: string): boolean => {
  if (isIpv4Literal(ip)) {
    return isBlockedIpv4(ip)
  }
  if (isIpv6Literal(ip)) {
    return isBlockedIpv6(ip)
  }
  return true
}

type DohAnswer = { type: number; data: string }
type DohResponse = { Answer?: DohAnswer[] }

const resolveHostname = async (hostname: string): Promise<string[]> => {
  const url = new URL(DOH_ENDPOINT)
  url.searchParams.set("name", hostname)
  url.searchParams.set("type", "A")

  const response = await fetch(url, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(DOH_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`DoH lookup failed with status ${response.status}`)
  }

  const body = (await response.json()) as DohResponse
  return (body.Answer ?? [])
    .filter(
      (answer) =>
        answer.type === DNS_RECORD_TYPE_A ||
        answer.type === DNS_RECORD_TYPE_AAAA,
    )
    .map((answer) => answer.data)
}

export type SsrfCheckResult =
  | { unsafe: true }
  | { unsafe: false; resolvedIps: string[] }

export const checkSsrfSafety = async (
  rawUrl: string,
): Promise<SsrfCheckResult> => {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { unsafe: true }
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { unsafe: true }
  }

  // URL.hostname keeps IPv6 literals bracketed (e.g. "[::1]"); strip the
  // brackets so downstream IP checks see the bare address consistently.
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { unsafe: true }
  }

  if (isIpv4Literal(hostname) || isIpv6Literal(hostname)) {
    return isBlockedIp(hostname)
      ? { unsafe: true }
      : { unsafe: false, resolvedIps: [hostname] }
  }

  try {
    const resolvedIps = await resolveHostname(hostname)
    if (resolvedIps.length === 0) {
      return { unsafe: true }
    }
    if (resolvedIps.some((ip) => isBlockedIp(ip))) {
      return { unsafe: true }
    }
    return { unsafe: false, resolvedIps }
  } catch {
    return { unsafe: true }
  }
}

export const isSsrfUnsafeUrl = async (rawUrl: string): Promise<boolean> =>
  (await checkSsrfSafety(rawUrl)).unsafe

/**
 * Throws when `rawUrl` resolves to a private/loopback/link-local address or
 * fails DNS resolution — the shared guard for any code path that makes an
 * outbound request to a user- or workspace-supplied URL.
 */
export const assertPublicUrl = async (
  rawUrl: string,
  context = "URL",
): Promise<void> => {
  const result = await checkSsrfSafety(rawUrl)
  if (result.unsafe) {
    throw new Error(`[ssrf-guard] ${context} is not allowed: ${rawUrl}`)
  }
}
