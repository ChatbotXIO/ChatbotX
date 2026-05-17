import { jwtVerify, SignJWT } from "jose"

const ALGORITHM = "HS256"
const TOKEN_TTL_SECONDS = 60
const BEARER_SCHEME = "Bearer"

export type RealtimeAudienceKind = "workspace" | "guest" | "user"

export interface RealtimeAudience {
  id: string
  kind: RealtimeAudienceKind
}

const formatAudience = ({ kind, id }: RealtimeAudience): string =>
  `${kind}:${id}`

const encodeSecret = (secret: string): Uint8Array =>
  new TextEncoder().encode(secret)

export const signRealtimeToken = async (
  audience: RealtimeAudience,
  secret: string,
): Promise<string> =>
  await new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setAudience(formatAudience(audience))
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(encodeSecret(secret))

export const verifyRealtimeToken = async (
  token: string,
  audience: RealtimeAudience,
  secret: string,
): Promise<void> => {
  await jwtVerify(token, encodeSecret(secret), {
    algorithms: [ALGORITHM],
    audience: formatAudience(audience),
  })
}

export const extractBearerToken = (
  authorizationHeader: string | null,
): string | null => {
  if (!authorizationHeader) {
    return null
  }
  const [scheme, token] = authorizationHeader.split(" ")
  if (scheme !== BEARER_SCHEME || !token) {
    return null
  }
  return token
}
