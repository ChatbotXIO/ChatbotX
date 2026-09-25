import { type JWTPayload, jwtVerify, SignJWT } from "jose"
import { z } from "zod"

const ALGORITHM = "HS256"
export const REALTIME_TOKEN_TTL_SECONDS = 60
const BEARER_SCHEME = "Bearer"

/**
 * Clock-skew tolerance between the realtime server and the builder, which
 * deploy separately and drift by NTP-class amounts. Kept short relative to the
 * 60s token TTL so it doesn't widen the replay window.
 */
const CLOCK_TOLERANCE_SECONDS = 5

/**
 * Every purpose a realtime token can be minted for. Bound into the payload and
 * checked on verify, so a token minted for one purpose can never be replayed
 * against another — the two workspace purposes share an audience.
 */
export const REALTIME_TOKEN_PURPOSE = {
  /** The existing builder -> party broadcast path (`onBeforeRequest`). */
  broadcast: "broadcast",
  /** A member's short-lived room-connect token (`signMemberConnectToken`). */
  memberConnect: "member-connect",
  /** The realtime server's periodic presence report to the builder. */
  presenceReport: "presence-report",
} as const

export type RealtimeTokenPurpose =
  (typeof REALTIME_TOKEN_PURPOSE)[keyof typeof REALTIME_TOKEN_PURPOSE]

export type RealtimeAudienceKind = "workspace" | "guest" | "user"

export interface RealtimeAudience {
  id: string
  kind: RealtimeAudienceKind
}

const formatAudience = ({ kind, id }: RealtimeAudience): string =>
  `${kind}:${id}`

const encodedSecrets = new Map<string, Uint8Array>()

const encodeSecret = (secret: string): Uint8Array => {
  const encodedSecret = encodedSecrets.get(secret)
  if (encodedSecret) {
    return encodedSecret
  }

  const encoded = new TextEncoder().encode(secret)
  encodedSecrets.set(secret, encoded)
  return encoded
}

/**
 * Extra claims carried in the JWT payload alongside the `aud` room binding. A
 * generic bag so this primitive stays caller-agnostic; each caller defines and
 * validates its own shape.
 */
export type RealtimeTokenClaims = Record<string, unknown>

export const signRealtimeToken = async (
  audience: RealtimeAudience,
  purpose: RealtimeTokenPurpose,
  secret: string,
  claims: RealtimeTokenClaims = {},
): Promise<string> =>
  await new SignJWT({ ...claims, purpose })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setAudience(formatAudience(audience))
    .setExpirationTime(`${REALTIME_TOKEN_TTL_SECONDS}s`)
    .sign(encodeSecret(secret))

/**
 * Verifies signature, expiry, `aud` (the room binding every caller relies on)
 * and `purpose`, then returns the decoded payload so callers can read their own
 * extra claims. `CLOCK_TOLERANCE_SECONDS` absorbs deploy-to-deploy clock drift.
 */
export const verifyRealtimeToken = async (
  token: string,
  audience: RealtimeAudience,
  purpose: RealtimeTokenPurpose,
  secret: string,
): Promise<JWTPayload> => {
  const { payload } = await jwtVerify(token, encodeSecret(secret), {
    algorithms: [ALGORITHM],
    audience: formatAudience(audience),
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
  })
  if (payload.purpose !== purpose) {
    throw new Error("Unexpected realtime token purpose")
  }
  return payload
}

const memberClaimsSchema = z.object({
  userId: z.string().min(1),
})

/** Claims carried by a room-connect token: the verified member's user id. */
export type RealtimeMemberClaims = z.infer<typeof memberClaimsSchema>

/**
 * Mints a short-lived connect token bound to a member of a workspace room:
 * `aud` carries the workspace room id (verified against `room.id` on connect)
 * and the payload carries the verified `userId`. Only the issuer (Builder,
 * after checking workspace membership) should call this.
 */
export const signMemberConnectToken = async (
  member: { workspaceId: string; userId: string },
  secret: string,
): Promise<string> =>
  signRealtimeToken(
    { kind: "workspace", id: member.workspaceId },
    REALTIME_TOKEN_PURPOSE.memberConnect,
    secret,
    { userId: member.userId },
  )

/**
 * Verifies a room-connect token minted by `signMemberConnectToken`. Throws on a
 * bad/expired signature, an `aud` that doesn't match `workspaceId`, or a
 * missing/malformed `userId` claim.
 * Never passes `allowLegacyMissingPurpose`: no purpose-less token of this kind
 * has ever existed, and accepting one would let it replay as a broadcast
 * token — both bind the same `workspace:<id>` audience under the same secret.
 */
export const verifyMemberConnectToken = async (
  token: string,
  workspaceId: string,
  secret: string,
): Promise<RealtimeMemberClaims> => {
  const payload = await verifyRealtimeToken(
    token,
    { kind: "workspace", id: workspaceId },
    REALTIME_TOKEN_PURPOSE.memberConnect,
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
