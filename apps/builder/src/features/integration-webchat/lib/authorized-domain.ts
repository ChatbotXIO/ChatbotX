const LEADING_DOTS_REGEX = /^\.+/
const TRAILING_DOTS_REGEX = /\.+$/
const PROTOCOL_PREFIX_REGEX = /^[a-z]+:\/\//i
const HOST_DELIMITER_REGEX = /[/:?#]/

const normalizeHost = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(LEADING_DOTS_REGEX, "")
    .replace(TRAILING_DOTS_REGEX, "")

export const getHostFromOrigin = (origin: string | null | undefined) => {
  if (!origin) {
    return null
  }

  const value = origin.trim()
  if (!value) {
    return null
  }

  try {
    return normalizeHost(new URL(value).hostname)
  } catch {
    const [host] = value
      .replace(PROTOCOL_PREFIX_REGEX, "")
      .split(HOST_DELIMITER_REGEX)
    return host ? normalizeHost(host) : null
  }
}

export const isOriginAuthorized = (
  origin: string | null | undefined,
  authorizedDomains: string[] = [],
) => {
  // No origin means the webchat was opened directly, not embedded in an
  // iframe — the allowlist only applies to embedding, so always allow.
  if (!origin) {
    return true
  }

  const domains = authorizedDomains.map(normalizeHost).filter(Boolean)
  if (domains.length === 0) {
    return false
  }

  const host = getHostFromOrigin(origin)
  if (!host) {
    return false
  }

  return domains.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  )
}
