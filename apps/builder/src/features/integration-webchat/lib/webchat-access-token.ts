import { Buffer } from "node:buffer"
import { hmacSha256Hex, timingSafeStringEqual } from "@chatbotx.io/utils/crypto"
import { isOriginAuthorized } from "./authorized-domain"

const TOKEN_TTL_SECONDS = 30 * 60
const MAX_SESSION_SECONDS = 24 * 60 * 60
// Refreshes retain the original issued-at claim and cannot extend the session
// beyond this absolute cap.

type WebchatAccessTokenPayload = {
  exp: number
  iat: number
  originHost: string | null
  webchatId: string
  workspaceId: string
}

type WebchatAccessTokenClaims = Omit<WebchatAccessTokenPayload, "exp">

type WebchatAccessTokenInput = {
  webchatId: string
  workspaceId: string
}

type WebchatAccessTokenVerification = {
  authorized: boolean
  originHost: string | null
}

type WebchatAccessToken = {
  expiresAt: number
  token: string
}

const base64UrlEncode = (value: string) =>
  Buffer.from(value, "utf8").toString("base64url")

const base64UrlDecode = (value: string) =>
  Buffer.from(value, "base64url").toString("utf8")

const getCurrentTimestamp = () => Math.floor(Date.now() / 1000)

const signPayload = (payload: string) => {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required")
  }
  return hmacSha256Hex(secret, payload)
}

const isWebchatAccessTokenPayload = (
  payload: unknown,
): payload is WebchatAccessTokenPayload => {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("exp" in payload) ||
    !("iat" in payload) ||
    !("originHost" in payload) ||
    !("webchatId" in payload) ||
    !("workspaceId" in payload)
  ) {
    return false
  }

  const { exp, iat, originHost, webchatId, workspaceId } = payload
  return (
    typeof exp === "number" &&
    Number.isSafeInteger(exp) &&
    typeof iat === "number" &&
    Number.isSafeInteger(iat) &&
    (originHost === null ||
      (typeof originHost === "string" && originHost.length > 0)) &&
    typeof webchatId === "string" &&
    webchatId.length > 0 &&
    typeof workspaceId === "string" &&
    workspaceId.length > 0
  )
}

const parseSignedPayload = async ({
  token,
  webchatId,
  workspaceId,
}: WebchatAccessTokenInput & {
  token?: string | null
}): Promise<WebchatAccessTokenPayload | null> => {
  if (!token) {
    return null
  }

  const [encodedPayload, signature, extra] = token.split(".")
  if (!(encodedPayload && signature) || extra) {
    return null
  }

  const expectedSignature = await signPayload(encodedPayload)
  if (!timingSafeStringEqual(signature, expectedSignature)) {
    return null
  }

  try {
    const payload: unknown = JSON.parse(base64UrlDecode(encodedPayload))
    if (
      !isWebchatAccessTokenPayload(payload) ||
      payload.workspaceId !== workspaceId ||
      payload.webchatId !== webchatId
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

const createToken = async (
  payload: WebchatAccessTokenClaims,
): Promise<WebchatAccessToken> => {
  const expiresAt = Math.min(
    getCurrentTimestamp() + TOKEN_TTL_SECONDS,
    payload.iat + MAX_SESSION_SECONDS,
  )
  const encodedPayload = base64UrlEncode(
    JSON.stringify({ ...payload, exp: expiresAt }),
  )
  const signature = await signPayload(encodedPayload)

  return {
    expiresAt,
    token: `${encodedPayload}.${signature}`,
  }
}

export const createWebchatAccessToken = async ({
  originHost,
  webchatId,
  workspaceId,
}: WebchatAccessTokenInput & {
  originHost: string | null
}): Promise<WebchatAccessToken> =>
  createToken({
    iat: getCurrentTimestamp(),
    originHost,
    webchatId,
    workspaceId,
  })

const verifyWebchatAccessToken = async ({
  token,
  webchatId,
  workspaceId,
}: WebchatAccessTokenInput & {
  token?: string | null
}): Promise<WebchatAccessTokenVerification> => {
  const payload = await parseSignedPayload({ token, webchatId, workspaceId })
  if (
    !payload ||
    payload.exp < getCurrentTimestamp() ||
    payload.iat + MAX_SESSION_SECONDS < getCurrentTimestamp()
  ) {
    return { authorized: false, originHost: null }
  }

  // The claim is derived from the Referer at page minting time, signed, and
  // re-checked against the current allowlist. Guest requests never send an
  // origin to compare, so removing a domain immediately revokes its tokens.
  return { authorized: true, originHost: payload.originHost }
}

// Direct-open tokens have no origin host and are intentionally allowed by a
// non-empty allowlist, matching the page's direct-open authorization rule.
export const isTokenOriginAllowed = (
  originHost: string | null,
  authorizedDomains: string[],
) =>
  authorizedDomains.length === 0 ||
  isOriginAuthorized(originHost, authorizedDomains)

export const authorizeWebchatGuestRequest = async ({
  authorizedDomains,
  token,
  webchatId,
  workspaceId,
}: WebchatAccessTokenInput & {
  authorizedDomains: string[]
  token?: string | null
}): Promise<WebchatAccessTokenVerification> => {
  const verification = await verifyWebchatAccessToken({
    token,
    webchatId,
    workspaceId,
  })
  if (!verification.authorized) {
    return verification
  }

  return {
    ...verification,
    authorized: isTokenOriginAllowed(
      verification.originHost,
      authorizedDomains,
    ),
  }
}

export const verifyRefreshableWebchatAccessToken = async ({
  token,
  webchatId,
  workspaceId,
}: WebchatAccessTokenInput & {
  token?: string | null
}): Promise<WebchatAccessTokenClaims | null> => {
  const payload = await parseSignedPayload({ token, webchatId, workspaceId })
  if (!payload || payload.iat + MAX_SESSION_SECONDS < getCurrentTimestamp()) {
    return null
  }

  const { exp: _exp, ...claims } = payload
  return claims
}

export const refreshWebchatAccessToken = createToken
