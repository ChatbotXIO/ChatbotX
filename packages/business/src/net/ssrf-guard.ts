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

const IPV6_GROUPS = 8
const BYTE_RANGE = 256
const IPV6_GROUP_RADIX = 16
const IPV6_GROUP_PATTERN = /^[0-9a-f]{1,4}$/

/** The 16-bit groups of an IPv6 address (`::` expanded, a dotted IPv4 tail converted), or `null` when it is not valid. */
const parseIpv6Groups = (address: string): number[] | null => {
  let text = address.toLowerCase()
  // A zone id (`fe80::1%eth0`) never belongs in a public address.
  if (text.includes("%")) {
    return null
  }
  const lastColon = text.lastIndexOf(":")
  const tail = text.slice(lastColon + 1)
  if (tail.includes(".")) {
    if (!isIpv4Literal(tail)) {
      return null
    }
    const octets = tail.split(".").map(Number)
    const high = (octets[0] ?? 0) * BYTE_RANGE + (octets[1] ?? 0)
    const low = (octets[2] ?? 0) * BYTE_RANGE + (octets[3] ?? 0)
    text = `${text.slice(0, lastColon + 1)}${high.toString(IPV6_GROUP_RADIX)}:${low.toString(IPV6_GROUP_RADIX)}`
  }
  const halves = text.split("::")
  if (halves.length > 2) {
    return null
  }
  const toGroups = (part: string): string[] => (part ? part.split(":") : [])
  const head = toGroups(halves[0] ?? "")
  const rest = halves.length === 2 ? toGroups(halves[1] ?? "") : []
  const missing = IPV6_GROUPS - head.length - rest.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) {
    return null
  }
  const words = [
    ...head,
    ...new Array<string>(halves.length === 2 ? missing : 0).fill("0"),
    ...rest,
  ]
  if (
    words.length !== IPV6_GROUPS ||
    !words.every((word) => IPV6_GROUP_PATTERN.test(word))
  ) {
    return null
  }
  return words.map((word) => Number.parseInt(word, IPV6_GROUP_RADIX))
}

/** The IPv4 address held in two 16-bit groups. */
const ipv4FromGroups = (high: number, low: number): string =>
  [
    Math.floor(high / BYTE_RANGE),
    high % BYTE_RANGE,
    Math.floor(low / BYTE_RANGE),
    low % BYTE_RANGE,
  ].join(".")

const isZero = (groups: readonly number[], from: number, to: number): boolean =>
  groups.slice(from, to).every((group) => group === 0)

const IPV6_LOOPBACK_LAST_GROUP = 1
/** First group of fe80::/10 (link-local), fec0::/10 (site-local), fc00::/7 (unique local) and ff00::/8 (multicast). */
const FE80_LINK_LOCAL = { end: 0xfe_c0, start: 0xfe_80 }
const FEC0_SITE_LOCAL = { end: 0xff_00, start: 0xfe_c0 }
const FC00_UNIQUE_LOCAL = { end: 0xfe_00, start: 0xfc_00 }
const MULTICAST = { end: 0x1_00_00, start: 0xff_00 }
const IPV4_MAPPED_GROUP = 0xff_ff
const NAT64_GROUPS = [0x64, 0xff_9b] as const
const NAT64_LOCAL_USE_THIRD_GROUP = 1
const SIX_TO_FOUR_GROUP = 0x20_02
const DOCUMENTATION_GROUPS = [0x20_01, 0x0d_b8] as const
const DISCARD_PREFIX_GROUP = 0x01_00

const inRange = (group: number, range: { end: number; start: number }) =>
  group >= range.start && group < range.end

/**
 * Every IPv6 range that is not a public unicast address, plus the ranges that
 * carry an IPv4 address (mapped, compatible, NAT64, 6to4), which are judged by
 * the IPv4 they carry. An address that does not parse is blocked.
 */
const isBlockedIpv6 = (ip: string): boolean => {
  const groups = parseIpv6Groups(ip.replace(/^\[|\]$/g, ""))
  if (!groups) {
    return true
  }
  const [g0 = 0, g1 = 0, g2 = 0] = groups
  const high = groups[6] ?? 0
  const low = groups[7] ?? 0

  // `::` (unspecified) and `::1` (loopback).
  if (isZero(groups, 0, 7) && (low === 0 || low === IPV6_LOOPBACK_LAST_GROUP)) {
    return true
  }
  if (
    inRange(g0, FE80_LINK_LOCAL) ||
    inRange(g0, FEC0_SITE_LOCAL) ||
    inRange(g0, FC00_UNIQUE_LOCAL) ||
    inRange(g0, MULTICAST)
  ) {
    return true
  }
  // 100::/64 (discard-only) and 2001:db8::/32 (documentation).
  if (g0 === DISCARD_PREFIX_GROUP && isZero(groups, 1, 4)) {
    return true
  }
  if (g0 === DOCUMENTATION_GROUPS[0] && g1 === DOCUMENTATION_GROUPS[1]) {
    return true
  }
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d).
  if (
    isZero(groups, 0, 5) &&
    (groups[5] === IPV4_MAPPED_GROUP || groups[5] === 0)
  ) {
    return isBlockedIpv4(ipv4FromGroups(high, low))
  }
  // NAT64 64:ff9b::/96 carries an IPv4; 64:ff9b:1::/48 is local-use space.
  if (g0 === NAT64_GROUPS[0] && g1 === NAT64_GROUPS[1]) {
    if (g2 === NAT64_LOCAL_USE_THIRD_GROUP) {
      return true
    }
    return isZero(groups, 2, 6)
      ? isBlockedIpv4(ipv4FromGroups(high, low))
      : true
  }
  // 6to4 2002::/16 embeds an IPv4 in the next two groups.
  if (g0 === SIX_TO_FOUR_GROUP) {
    return isBlockedIpv4(ipv4FromGroups(g1, g2))
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
