/**
 * The `exp` claim of a JWT in milliseconds, read WITHOUT verifying the
 * signature. Only safe for decisions that reject or shorten trust: a forged
 * token cannot gain anything from a past or earlier `exp`. Undefined for an
 * opaque token or a payload without a numeric `exp`.
 */
export const unverifiedJwtExpiryMs = (token: string): number | undefined => {
  const payload = token.split(".")[1]
  if (!payload) {
    return
  }
  try {
    const { exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { exp?: unknown }
    return typeof exp === "number" && Number.isFinite(exp)
      ? exp * 1000
      : undefined
  } catch {
    return
  }
}

/** True for a JWT whose `exp` has passed, signed or not: it is invalid either way. */
export const isExpiredJwt = (token: string, nowMs = Date.now()): boolean => {
  const expiryMs = unverifiedJwtExpiryMs(token)
  return expiryMs !== undefined && expiryMs <= nowMs
}
