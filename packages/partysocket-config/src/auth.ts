import { type JWTPayload, jwtVerify, SignJWT } from "jose"
import { z } from "zod"

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

/**
 * Optional extra claims carried inside the JWT payload, on top of the
 * `aud` room binding. Kept as a generic string-keyed bag here (not typed to
 * any one caller's shape) so this primitive stays channel-agnostic — callers
 * define and validate their own claim shape (see `memberClaimsSchema` below
 * for the room-connect use case).
 */
export type RealtimeTokenClaims = Record<string, unknown>

export const signRealtimeToken = async (
  audience: RealtimeAudience,
  secret: string,
  claims: RealtimeTokenClaims = {},
): Promise<string> =>
  await new SignJWT(claims)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setAudience(formatAudience(audience))
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(encodeSecret(secret))

/**
 * Verifies the token's signature, expiry, and `aud` claim against
 * `audience` — `jwtVerify` throws when the token's audience does not match,
 * which is the room-binding check every caller (broadcast auth, member
 * connect auth) relies on. Returns the decoded payload so callers can read
 * any extra claims `signRealtimeToken` embedded.
 */
export const verifyRealtimeToken = async (
  token: string,
  audience: RealtimeAudience,
  secret: string,
): Promise<JWTPayload> => {
  const { payload } = await jwtVerify(token, encodeSecret(secret), {
    algorithms: [ALGORITHM],
    audience: formatAudience(audience),
  })
  return payload
}

const memberClaimsSchema = z.object({
  userId: z.string().min(1),
})

/** Claims carried by a room-connect token: the verified member's user id. */
export type RealtimeMemberClaims = z.infer<typeof memberClaimsSchema>

/**
 * Mints a one-time connect token bound to a member of a workspace room:
 * `aud` carries the workspace room id (verified against `room.id` on
 * connect — see `verifyMemberConnectToken`) and the payload carries the
 * verified `userId`. Only the issuer (Builder, after checking workspace
 * membership) should call this.
 */
export const signMemberConnectToken = async (
  member: { workspaceId: string; userId: string },
  secret: string,
): Promise<string> =>
  signRealtimeToken({ kind: "workspace", id: member.workspaceId }, secret, {
    userId: member.userId,
  })

/**
 * Verifies a room-connect token minted by `signMemberConnectToken`. Rejects
 * (throws) when the signature is invalid/expired, when the token's `aud`
 * does not match `workspaceId` (cross-room replay), or when the `userId`
 * claim is missing/malformed — a token missing the claim is never silently
 * trusted.
 */
export const verifyMemberConnectToken = async (
  token: string,
  workspaceId: string,
  secret: string,
): Promise<RealtimeMemberClaims> => {
  const payload = await verifyRealtimeToken(
    token,
    { kind: "workspace", id: workspaceId },
    secret,
  )
  return memberClaimsSchema.parse(payload)
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
