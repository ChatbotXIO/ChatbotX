import { Buffer } from "node:buffer"
import { hmacSha256Hex, timingSafeStringEqual } from "@chatbotx.io/utils/crypto"

const TOKEN_TTL_SECONDS = 30 * 60

type WebchatAccessTokenPayload = {
  exp: number
  origin: string | null
  webchatId: string
  workspaceId: string
  verifiedExternalId?: string | null
}

type WebchatAccessTokenInput = {
  origin?: string | null
  webchatId: string
  workspaceId: string
  verifiedExternalId?: string | null
}

type WebchatAccessTokenVerification = {
  authorized: boolean
  verifiedExternalId: string | null
}

const base64UrlEncode = (value: string) =>
  Buffer.from(value, "utf8").toString("base64url")

const base64UrlDecode = (value: string) =>
  Buffer.from(value, "base64url").toString("utf8")

const signPayload = (payload: string) => {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required")
  }
  return hmacSha256Hex(secret, payload)
}

export const createWebchatAccessToken = async ({
  workspaceId,
  webchatId,
  origin,
  verifiedExternalId,
}: WebchatAccessTokenInput) => {
  const payload: WebchatAccessTokenPayload = {
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    origin: origin ?? null,
    webchatId,
    workspaceId,
    verifiedExternalId: verifiedExternalId ?? null,
  }
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = await signPayload(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export const verifyWebchatAccessToken = async ({
  token,
  workspaceId,
  webchatId,
  origin,
}: WebchatAccessTokenInput & {
  token?: string | null
}): Promise<WebchatAccessTokenVerification> => {
  const unauthorized: WebchatAccessTokenVerification = {
    authorized: false,
    verifiedExternalId: null,
  }

  if (!token) {
    return unauthorized
  }

  const [encodedPayload, signature] = token.split(".")
  if (!(encodedPayload && signature)) {
    return unauthorized
  }

  const expectedSignature = await signPayload(encodedPayload)
  if (!timingSafeStringEqual(signature, expectedSignature)) {
    return unauthorized
  }

  try {
    const payload = JSON.parse(
      base64UrlDecode(encodedPayload),
    ) as WebchatAccessTokenPayload
    const authorized =
      payload.workspaceId === workspaceId &&
      payload.webchatId === webchatId &&
      (!origin || payload.origin === origin) &&
      payload.exp >= Math.floor(Date.now() / 1000)

    return {
      authorized,
      verifiedExternalId: authorized
        ? (payload.verifiedExternalId ?? null)
        : null,
    }
  } catch {
    return unauthorized
  }
}
